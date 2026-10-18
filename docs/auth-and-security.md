# Local authentication and security

## Initial setup

Before exposing the dashboard, set the server-only `FINANCIAL_TRACKER_SESSION_SECRET` environment value in a local environment file or your process manager. It must be at least 32 characters and remain available and stable across restarts; rotating it invalidates signed browser session cookies. Keep it out of source control and shell history where practical.

Start the service and visit the dashboard. On a fresh database, the first-run screen creates the only local administrator account. It requires a confirmed password of at least 8 characters, stores only a salted password verifier in SQLite, and immediately establishes a seven-day server-side session. No bootstrap password is required or supported. Competing first-run submissions are atomically constrained to a single account.

If either required setup condition is absent, the application shows a configuration screen and does not expose financial data.

## Ongoing account operations

- Sign in through the local dashboard. A successful sign-in creates a seven-day server-side session.
- Use Settings to change the password. The application verifies the current password, stores a new verifier, revokes all sessions, clears the current browser session, and requires sign-in again.
- Use Logout to revoke only the current active session and clear its cookie.
- After five failed login attempts from the same client-address scope, that scope is locked for 15 minutes. A successful login clears its failure counter.

There is no second account, password-reset email flow, or recovery API. Preserve secure operational access to the local host and database backup. Direct database changes to authentication records should be treated as an emergency recovery procedure and tested on a copy first.

## Request protections

- The browser receives a signed, HTTP-only, SameSite=Lax session cookie. Its Secure flag is enabled when the incoming request or trusted proxy headers indicate HTTPS.
- Session IDs, expiry, revocation state, and a CSRF verifier are stored server-side. Cookie signatures use an HMAC derived from the session-secret environment value; tampered or expired values fail authentication.
- All application APIs require an authenticated session. State changes additionally require a matching CSRF request header and same-origin request validation. The client helper reads the CSRF value supplied to the authenticated page and adds it to non-safe requests.
- Login requires a present, valid same-origin Origin header. The origin calculation is proxy-aware through forwarded host/protocol headers; configure those headers correctly at a trusted reverse proxy.
- Password verification uses a memory-hard scrypt-derived verifier and timing-safe comparison.

## Deployment and data-handling guidance

This project is designed for local use. If it is made reachable beyond a trusted local network, terminate TLS at a correctly configured proxy, restrict access at the network layer, protect the database file with host permissions and backups, and maintain the environment values in a secrets facility. Do not place access material in `.env.example`, repository documentation, issue comments, client-side code, CSV exports, screenshots, or support logs.

The application does not implement multi-user authorization, audit trails, encryption at rest, account recovery, or automated backup retention. Evaluate and add those controls before treating it as a shared or Internet-facing financial system.
