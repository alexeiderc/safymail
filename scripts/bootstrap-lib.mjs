import { createHash } from "node:crypto";

export function deriveInstallationIdempotencyKey(domain, adminEmail) {
  return "safymail-" + createHash("sha256")
    .update(String(domain).trim().toLowerCase() + "\n" + String(adminEmail).trim().toLowerCase())
    .digest("hex").slice(0, 48);
}

export function validateBootstrapInput(input) {
  const errors = [];
  let url;
  try {
    url = new URL(input.controlPlaneUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) errors.push("controlPlaneUrl");
  } catch { errors.push("controlPlaneUrl"); }
  if (!/^[A-Za-z0-9._~-]{32,512}$/.test(input.controlPlaneAdminToken || "")) errors.push("controlPlaneAdminToken");
  if (!/^[a-f0-9]{32}$/i.test(input.cloudflareAccountId || "")) errors.push("cloudflareAccountId");
  if (typeof input.cloudflareApiToken !== "string" || input.cloudflareApiToken.length < 20) errors.push("cloudflareApiToken");
  if (!/^re_[A-Za-z0-9_]{20,}$/.test(input.resendApiKey || "")) errors.push("resendApiKey");
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(input.domain || "")) errors.push("domain");
  if (!/^[^\s@]{1,64}@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(input.adminEmail || "")) errors.push("adminEmail");
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.totpEncryptionKey || "")) errors.push("totpEncryptionKey");
  return { valid: errors.length === 0, errors, controlPlaneOrigin: url?.origin || null };
}
