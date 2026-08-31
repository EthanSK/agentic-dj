# Changelog

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
