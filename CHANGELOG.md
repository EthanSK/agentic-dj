# Changelog

## 0.3.1 — 2026-09-01

- Replaced the ineffective iframe Media Session workaround with a custom Web Audio player that Chromium treats as ambient rather than hardware-key controllable.
- Kept official Bandcamp playback, live volume, play/pause, and scrubbing while removing every `<iframe>`, `<audio>` element, and Media Session action handler from the listening path.
- Added a local-only, memory-only Bandcamp preview relay with strict track-ID, host, path, response-size, and same-origin validation.
- Changed imported Spotify previews to explicit Spotify links because their embedded player can claim hardware media keys.

## 0.3.0 — 2026-09-01

- Rebuilt the listening desk around one record, one preview, and the three decisions, removing the oversized hero and repeated learning-loop explanations.
- Moved feedback, taste clues, search filters, shopping provenance, and secondary track metadata into compact, accessible disclosure controls without removing their data or actions.
- Added an initial Media Session interception attempt; v0.3.1 replaces it because a cross-origin child player could still claim the Mac play/pause media keys.
- Kept BPM, key, length, source, price, volume, queue navigation, undo, imports, backups, next-round requests, and keeper CSV immediately available.
- Improved responsive layout, keyboard focus, visible state, and touch target sizing.

## 0.2.1 — 2026-09-01

- Made official Bandcamp previews start at 25% and added an in-app volume slider with an explicit player-reload warning.
- Added a compact DJ readout for BPM, alternate tempo, key, length, label, and release date, with uncertainty shown rather than guessed.
- Included the same DJ facts in keeper CSV exports.
- Added identity-safe bundled metadata backfill so existing local votes and imported metadata survive the richer calibration data.

## 0.2.0 — 2026-08-31

- Replaced the fixed D&B-heavy queue with an ear-led ten-track calibration round.
- Added broad genre labels, concrete sound traits, and a visible provisional Earprint derived from Keep, Pass, Later, tags, and notes.
- Added a round-completion request that prepares a private brief for exactly ten more agent-researched tracks while preserving all earlier evidence.
- Enlarged official Bandcamp players and added a clearly labelled YouTube search fallback.
- Made the tenth decision open the next-round request regardless of the active queue filter, and strengthened future rounds around explicit sound contrasts instead of genre repetition.

## 0.1.0 — 2026-08-31

- Added the local listening desk with official previews and a 64-track demo crate.
- Added Keep, Pass, Later, notes, tags, keyboard controls, filters, and undo.
- Added revision-checked D1/SQLite persistence with import identity protection.
- Added private agent briefs, crate/backups, keeper JSON, and CSV export.
- Added explicit purchase-approval and local-only network boundaries.
- Added a fast-forward-only updater with private-data backup and recovery refs.
