import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { deriveInstallationIdempotencyKey, validateBootstrapInput } from "./bootstrap-lib.mjs";

const valid = {
  controlPlaneUrl: "https://control.example.workers.dev",
  controlPlaneAdminToken: "A".repeat(48),
  cloudflareAccountId: "a".repeat(32),
  cloudflareApiToken: "c".repeat(40),
  resendApiKey: "re_" + "r".repeat(24),
  domain: "example.com",
  adminEmail: "admin@example.com",
  totpEncryptionKey: "T".repeat(43)
};
assert.deepEqual(validateBootstrapInput(valid), {
  valid: true, errors: [], controlPlaneOrigin: "https://control.example.workers.dev"
});
assert.equal(
  deriveInstallationIdempotencyKey("Example.COM", "Admin@Example.com"),
  deriveInstallationIdempotencyKey("example.com", "admin@example.com")
);
assert.match(deriveInstallationIdempotencyKey("example.com", "admin@example.com"), /^safymail-[a-f0-9]{48}$/);
for (const [key, value] of [
  ["controlPlaneUrl", "http://control.example.com"],
  ["cloudflareAccountId", "not-an-account"],
  ["resendApiKey", "invalid"],
  ["domain", "not a domain"],
  ["adminEmail", "invalid"],
  ["totpEncryptionKey", "short"]
]) {
  const result = validateBootstrapInput({ ...valid, [key]: value });
  assert.equal(result.valid, false, key + " must be rejected");
  assert.ok(result.errors.includes(key), key + " must be reported");
}
const cli = await readFile(new URL("./bootstrap-installation.mjs", import.meta.url), "utf8");
const registerIndex = cli.indexOf('api("/api/provider-accounts"');
const attachIndex = cli.indexOf('api("/api/installations/" + encodeURIComponent(installationId) + "/provider-account"');
const provisionIndex = cli.indexOf('api("/api/installations/" + encodeURIComponent(installationId) + "/provision"');
assert.ok(registerIndex >= 0 && attachIndex > registerIndex && provisionIndex > attachIndex,
  "Provider account and shared webhook must be registered and attached before provisioning starts.");
const provisionBlock = cli.slice(provisionIndex, cli.indexOf("status = \"provisioning\"", provisionIndex));
assert.doesNotMatch(provisionBlock, /cloudflareApiToken|resendApiKey/,
  "Provisioning must consume encrypted provider-account credentials, not resubmit raw secrets.");
console.log("Bootstrap orchestration input, idempotency and provider-registration tests passed.");
