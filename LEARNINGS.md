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
- Ten-track rounds can replace the active crate without deleting previous tracks, votes, or profile data. Keep the inferred Earprint provisional and keep raw decisions, tags, and notes as the primary evidence for future curation.
- `later` is a completed listening decision but a neutral taste signal. Count it toward round progress without treating uncertainty as either a positive or negative preference.
- The tenth decision must open the completed-round handoff regardless of the current queue filter. A browser-only build must download an explicit private agent brief rather than imply it contacted an AI service by itself.
- Independent taste models are useful for identifying missing experimental axes, but their discography recall is not source evidence. Verify every named recording against an official page and the owned-library reference before it enters a round.
- Bandcamp's official cross-origin embed accepts a load-time `volume` query but exposes no parent-page runtime volume control. Changing the level must reload the iframe and reset its playhead; remove the iframe at 0% because a literal zero query can fall back to full volume.
- Existing installations can receive richer bundled DJ metadata without rewriting their database on startup: overlay only missing fields for the same stable ID plus normalised artist/title, never replace local metadata, votes, history, or profile state, and let the next ordinary mutation persist the enriched payload.
