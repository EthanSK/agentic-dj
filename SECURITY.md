# Security policy

Agentic DJ is a local-only application. The current `0.1.x` line receives security fixes on `main`.

Please report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/EthanSK/agentic-dj/security/advisories/new). Do not include real listening data, account exports, receipts, tokens, credentials, or purchased music in a report. Use a synthetic crate.

Security-sensitive boundaries include localhost binding, same-origin mutation checks, crate URL/iframe validation, import size limits, revision-safe writes, CSV formula neutralisation, updater origin verification, private-data path protection, and non-destructive recovery.

This local app has no authentication and is not safe to expose through a tunnel, public reverse proxy, shared host, or cloud deployment.
