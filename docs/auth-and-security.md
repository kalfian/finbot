# Authentication and security

## Accounts and first login

The upstream multi-user authentication model is retained. A fresh database creates administrator `admin` with temporary password `123456`. Financial APIs, integrations and the dashboard are blocked until that password is changed. Administrators create additional users; every account has its own expenses, categories, proofs, monthly limit, source IDs and tokens.

Passwords use salted scrypt hashes. New passwords require 8-128 characters with a letter and a digit. Five failed login attempts lock that account for 15 minutes. There is no password-reset email workflow.

## Sessions and authorization

Login returns a revocable JWT and stores it in an HttpOnly, SameSite=Lax browser cookie, with Secure on HTTPS. Session records support revocation. Signing material is generated in the database's app_secrets table; FINANCIAL_TRACKER_SESSION_SECRET is not used.

Browser writes pass same-origin checks and use their session cookie. REST v1 and MCP also accept Bearer login JWTs or generated integration tokens, each scoped to its owning user. Generated tokens cannot change passwords. Server page guards enforce login, password-change requirements, and administrator-only user management.

Changing a password revokes existing sessions and issues a replacement session to the caller. Logout revokes the current session and clears the cookie. Credentials are never stored in browser localStorage; only theme preference is stored there.

## Operations

Bind deliberately, use HTTPS and network restrictions for remote access, and protect database/proof files with host permissions. Back up SQLite consistently with its adjacent proofs directory. Do not commit credentials, database files, tokens or private receipts.

The integrated release retains the remote multi-user schema and its supported migrations. The earlier unpublished single-account snapshot (7930211) used a different auth schema; importing data from that prototype is a separate migration task, not an automatic account conversion. Do not point a running service at that prototype database without a backup and migration review.
