import assert from "node:assert/strict";
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
console.log("Bootstrap orchestration input and idempotency tests passed.");
