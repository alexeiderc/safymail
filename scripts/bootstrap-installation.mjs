import { deriveInstallationIdempotencyKey, validateBootstrapInput } from "./bootstrap-lib.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const env = process.env;
const required = ["CONTROL_PLANE_URL", "CONTROL_PLANE_ADMIN_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "RESEND_API_KEY", "DOMAIN", "ADMIN_EMAIL", "TOTP_ENCRYPTION_KEY"];
function stop(message, code = 1) {
  console.error("[bootstrap] " + message);
  process.exit(code);
}
for (const key of required) if (!env[key]?.trim()) stop("Missing required environment variable: " + key + ". No resources were changed.");

const validation = validateBootstrapInput({
  controlPlaneUrl: env.CONTROL_PLANE_URL,
  controlPlaneAdminToken: env.CONTROL_PLANE_ADMIN_TOKEN,
  cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID,
  cloudflareApiToken: env.CLOUDFLARE_API_TOKEN,
  resendApiKey: env.RESEND_API_KEY,
  domain: env.DOMAIN,
  adminEmail: env.ADMIN_EMAIL,
  totpEncryptionKey: env.TOTP_ENCRYPTION_KEY
});
if (!validation.valid) stop("Invalid configuration fields: " + validation.errors.join(", ") + ". No resources were changed.");
const baseUrl = validation.controlPlaneOrigin;
const timeoutMinutes = Number(env.BOOTSTRAP_TIMEOUT_MINUTES || 30);
if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 60) stop("BOOTSTRAP_TIMEOUT_MINUTES must be between 1 and 60.");
const domain = env.DOMAIN.toLowerCase();
const adminEmail = env.ADMIN_EMAIL.toLowerCase();
const idempotencyKey = env.INSTALLATION_IDEMPOTENCY_KEY?.trim() || deriveInstallationIdempotencyKey(domain, adminEmail);
if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) stop("INSTALLATION_IDEMPOTENCY_KEY has an invalid format.");

async function api(pathname, options = {}) {
  let response;
  try {
    response = await fetch(baseUrl + pathname, {
      ...options,
      headers: {
        Authorization: "Bearer " + env.CONTROL_PLANE_ADMIN_TOKEN,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      },
      redirect: "error",
      signal: AbortSignal.timeout(30000)
    });
  } catch {
    stop("Control plane could not be reached securely. Check connectivity and retry; no credentials were printed.");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object") {
    const code = typeof payload?.error === "string" ? payload.error : "invalid_response";
    stop("Control plane request failed (" + response.status + ", " + code + ").");
  }
  return payload;
}

console.log("[bootstrap] Registering or reusing installation for " + domain + "...");
const createBody = {
  domain,
  adminEmail,
  ...(env.APP_NAME?.trim() ? { appName: env.APP_NAME.trim() } : {}),
  ...(env.WORKER_NAME?.trim() ? { workerName: env.WORKER_NAME.trim() } : {})
};
const created = await api("/api/installations", {
  method: "POST",
  headers: { "Idempotency-Key": idempotencyKey },
  body: JSON.stringify(createBody)
});
const installationId = created.id;
if (typeof installationId !== "string" || !/^[a-f0-9-]{16,64}$/i.test(installationId)) stop("Control plane returned an invalid installation ID.");
console.log("[bootstrap] Installation " + installationId + " (" + (created.reused ? "reused" : "created") + ").");

let state = await api("/api/installations/" + encodeURIComponent(installationId));
let status = state.installation?.status;
if (status === "draft" || status === "failed" || status === "paused") {
  console.log("[bootstrap] Registering encrypted provider credentials and shared webhook...");
  const provider = await api("/api/provider-accounts", {
    method: "POST",
    body: JSON.stringify({
      credentials: {
        cloudflareApiToken: env.CLOUDFLARE_API_TOKEN,
        cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID.toLowerCase(),
        resendApiKey: env.RESEND_API_KEY
      }
    })
  });
  if (typeof provider.providerAccountId !== "string" || !/^[a-f0-9-]{16,64}$/i.test(provider.providerAccountId)) {
    stop("Control plane returned an invalid provider-account ID. Provisioning was not started.");
  }
  await api("/api/installations/" + encodeURIComponent(installationId) + "/provider-account", {
    method: "POST",
    body: JSON.stringify({ providerAccountId: provider.providerAccountId })
  });
  console.log("[bootstrap] Starting asynchronous resource provisioning...");
  await api("/api/installations/" + encodeURIComponent(installationId) + "/provision", {
    method: "POST",
    body: JSON.stringify({})
  });
  status = "provisioning";
}

const deadline = Date.now() + timeoutMinutes * 60 * 1000;
while (status === "provisioning" && Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 5000));
  state = await api("/api/installations/" + encodeURIComponent(installationId));
  status = state.installation?.status;
  const step = state.installation?.current_step;
  if (step) console.log("[bootstrap] Provisioning: " + step + ".");
}
if (status === "provisioning") stop("Provisioning did not finish within " + timeoutMinutes + " minutes. The job remains tracked by the control plane; rerun this command to resume safely.", 2);
if (status === "failed") {
  const code = state.installation?.error_code || "provisioning_failed";
  stop("Provisioning failed (" + code + "). Review the control-plane checkpoints before retrying.", 2);
}
if (status === "ready") {
  console.log("[bootstrap] This installation is already marked ready. No redeployment was attempted.");
  process.exit(0);
}
if (status !== "configuring") stop("Installation reached unexpected state: " + String(status) + ". No deployment was attempted.", 2);

console.log("[bootstrap] Cloudflare resources are ready. Deploying the mail Worker and installing runtime secrets...");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(process.execPath, [path.join(root, "scripts/deploy-installation.mjs")], {
  cwd: root,
  env: { ...env, INSTALLATION_ID: installationId },
  stdio: "inherit"
});
if (result.error || result.status !== 0) stop("Worker deployment failed. The control-plane installation remains configuring; inspect the output and rerun after resolving the issue.", result.status || 1);

console.log("[bootstrap] Infrastructure provisioning and Worker deployment completed.");
console.log("[bootstrap] Next: run DNS, Email Routing and Custom Domain preflight commands. They do not change resources.");
console.log("[bootstrap] The installation is not ready until administrator bootstrap, MFA, DNS and end-to-end mail checks are complete.");
