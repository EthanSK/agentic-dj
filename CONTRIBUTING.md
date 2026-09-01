# Contributing

Thanks for helping make Agentic DJ more useful without making it less private.

1. Open an issue describing the user problem.
2. Fork the repository and create a focused branch.
3. Run `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, and `npm audit --omit=dev`.
4. Keep personal crates, profiles, library exports, votes, receipts, credentials, music, and database files out of commits and issues.
5. Explain the privacy and authority impact of changes that touch external services, imports, purchases, or updating.

Do not add automatic purchases, stream ripping, arbitrary remote iframes, analytics, public bindings, or hidden account mutations. New providers need a documented official preview-source format, restricted host validation, tests, clear network disclosure, and proof that playback does not become a controllable hardware-media-key session.

Changes to the update path must remain fast-forward-only, recoverable, data-preserving, and non-destructive. Never make `reset --hard`, `clean`, forced checkout, or implicit stashing part of normal updating.

The bundled crate is intentionally public and may be improved with verified legitimate sources. Keep reasons short and original, distinguish observed price from cheapest price, and do not commit copyrighted audio or artwork files.
