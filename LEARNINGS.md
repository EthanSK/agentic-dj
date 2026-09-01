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
- Bandcamp's official cross-origin embed accepts only a load-time `volume` query and exposes no parent-page runtime volume control. Use a `GainNode` in the local Web Audio player for live volume without resetting the playhead.
- Existing installations can receive richer bundled DJ metadata without rewriting their database on startup: overlay only missing fields for the same stable ID plus normalised artist/title, never replace local metadata, votes, history, or profile state, and let the next ordinary mutation persist the enriched payload.
- A cross-origin preview can become Chrome's active Media Session even when the parent page only embeds it. A top-frame no-op handler does not override a child frame's session, and current Chromium does not implement the Media Session permissions-policy token. Do not use an `<iframe>` or `<audio>` element in the listening path when hardware-key isolation is required.
- Chromium registers Web Audio playback as an ambient player rather than a controllable media session. Fetch the official Bandcamp preview through the strict local relay, decode it into an `AudioBuffer`, and use `AudioBufferSourceNode` plus `GainNode` for play, pause, seek, and volume.
- React development remounts and hot replacement can run Web Audio cleanup more than once. Clear the stored context before closing it, check for the `closed` state, and handle the close promise so cleanup stays idempotent and never creates an unhandled rejection.
- Media-key acceptance requires real routing evidence. A registered JavaScript handler, DOM marker, or ordinary unit test does not prove what an actual macOS hardware key controls.
- The listening desk's primary job is one record followed by Keep, Pass, or Later. Keep preview level and DJ facts visible, but put taste explanations, feedback, filters, shopping provenance, and agent-loop tooling behind labelled progressive disclosure; audit every old control and export before removing visible copy.
- The health endpoint is part of installed-version verification. Read its version from `package.json` at build time instead of maintaining a second hard-coded release number.
- Spotify playlist pages virtualise long track lists. A visible first batch is not a playlist inventory: verify the reported total, collect every numbered row across the virtualised range, and prove there are no missing positions before calling the reference complete.
- Treat Rekordbox playlist hierarchy as graded evidence, not one flat list of favourites. A deliberately curated best list can be a strong positive signal, while good, okay, meme, overlay, and own-track lists retain their narrower set-building meaning; current Keep and Pass decisions still outrank older library placement.
