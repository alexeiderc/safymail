# Security policy and deployment checklist

Safymail is a multi-tenant mail application built for Cloudflare Workers. Its current application authentication is implemented by the application itself; Cloudflare Access is not a required authentication layer in the current code path. Do not follow older Access-JWT setup instructions unless a future version explicitly reintroduces that integration.

## Before exposing an installation

1. Use a dedicated Worker, D1 database, KV namespace and domain zone for each installation. Never copy resource IDs from another installation.
2. Use least-privilege Cloudflare API tokens. Separate read-only DNS inspection permissions from DNS write permissions.
3. Run installer and deployment scripts only from a trusted workstation or controlled CI runner. Never run them in browser code or an untrusted shell.
4. Store provider credentials and encryption keys in a secrets manager. Supply them through protected environment variables or secure prompts; never commit them or paste them into issues, chats or logs.
5. Use HTTPS for the control-plane URL and verify that the hostname belongs to the intended deployment.
6. Complete first-administrator bootstrap, remove BOOTSTRAP_TOKEN immediately afterwards, enable TOTP and store recovery codes offline.
7. Validate tenant isolation, authorization, mail routing, webhook signatures, backup/restore and end-to-end delivery before production use.
8. Keep Cloudflare and Resend within the intended free-tier limits. Do not enable paid services or automatic billing as part of installation.

## Authentication and sessions

- Passwords use PBKDF2-HMAC-SHA-256, an individual random salt and 100,000 iterations in the current Worker implementation.
- Session identifiers are random. Only a SHA-256 digest is stored in D1.
- The session cookie is named __Host-emc_session and uses Secure, HttpOnly, SameSite=Strict and Path=/. Sessions have a 12-hour absolute lifetime and a 2-hour inactivity limit.
- Users with TOTP enabled must complete the MFA challenge at login. Privileged operations require an MFA-verified session where enforced by the route.
- TOTP secrets are encrypted with AES-GCM using TOTP_ENCRYPTION_KEY. Recovery codes are single-use and stored as hashes.
- Mutable requests validate their origin. Keep the application and browser origin on HTTPS; do not weaken origin checks to work around deployment errors.
- The first administrator is created through the one-time bootstrap flow; there is no public self-registration.

These controls do not replace a security review. Confirm route-level authorization requirements before adding endpoints.

## Tenant and data isolation

- The backend must derive the authenticated user from the server-side session, never from a user ID supplied by the browser.
- Every data access must enforce company membership and explicit mailbox/account permissions.
- Administrative actions and access to tenant data must remain restricted to authorized roles and audited where supported.
- Suspensions should block access without silently deleting mailbox data.
- Recheck authorization before serving message bodies, MIME originals and attachments. Never trust an object key or mailbox identifier supplied by the client without resolving its ownership in D1.
- Do not render untrusted message HTML in the application origin. Preserve sandboxing and content restrictions when changing the mail viewer.

## Secrets and sensitive files

Never commit:
- Cloudflare API tokens, account credentials or SSH private keys.
- Resend API keys or webhook signing secrets.
- CONTROL_PLANE_ADMIN_TOKEN, CONTROL_PLANE_VAULT_KEY, TOTP_ENCRYPTION_KEY, BOOTSTRAP_TOKEN, maintenance tokens or relay tokens.
- Generated wrangler.toml, wrangler.control-plane.toml, installation.json, .dev.vars files or .env files containing local values.
- Database dumps, production backups, private keys or local credential exports.

The repository .gitignore excludes common local configuration and secret files, but .gitignore is not a security boundary. Before every commit, inspect git status --short and the staged diff. If a credential is committed, revoke/rotate it immediately; deleting it in a later commit does not make it safe.

The deployment script intentionally displays the one-time bootstrap token once at the end. Treat terminal output as secret, do not capture it in CI logs, and remove the token after initial administrator creation.

## Control plane

The control plane stores provider credentials encrypted using its vault key and derives installation-specific maintenance/relay credentials. Protect its D1 database, vault key, admin bearer token and Worker deployment as production-grade secrets. Restrict administrative endpoints and review audit events. Do not expose deployment manifests or decrypted secrets to unauthenticated clients.

## Reporting a vulnerability

Do not publish exploitable details or live credentials in a public issue. Contact the repository maintainer privately with the affected component, impact, reproduction steps and a safe way to coordinate remediation. Rotate any credential that may have been exposed before investigating further.
