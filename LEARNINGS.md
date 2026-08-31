# Project learnings

## Durable implementation facts

- Bandcamp public release pages expose structured `data-tralbum` metadata with track IDs and preview availability. Read the structure, not stream URLs; a track ID is sufficient for the official embed.
- Direct Bandcamp track pages and album pages have different price scope. Only direct-track metadata can justify `scope: track`; release-level minimums must stay labelled as release pricing.
- Some Bandcamp artist URLs redirect to custom domains. The metadata helper deliberately rejects custom domains instead of turning a music helper into an arbitrary URL fetcher; verify those sources separately.
- Not every track listed on an album exposes an embeddable preview. Curated demo crates must verify `hasPreview` for every selected track.
- The local database seed uses `INSERT OR IGNORE`. Updating bundled crate JSON must never overwrite existing votes; ship a deliberate, identity-safe crate import or migration when existing installations need new content.
- Vote writes use a read revision plus a compare-and-swap update. Idempotency IDs handle retries; revision checks handle concurrent tabs. Neither mechanism replaces the other.
- Undo must compare the current vote with the history event’s `after` value. Replaying an older undo over a newer decision is a data-loss bug.
- Imported recording IDs may refresh metadata only when normalised artist and title still match. This prevents an old vote from attaching to a different recording.
- Spreadsheet exports need formula neutralisation for values beginning with `=`, `+`, `-`, or `@`, including after leading whitespace.
- Local update safety needs three distinct recoveries: refuse a dirty source tree, back up ignored private state while the server is stopped, and retain the old Git commit on a recovery branch. Do not silently reset or roll back.
