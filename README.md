# Agentic DJ

**Find good records with an agent. Decide with your ears. Buy only after you approve the shortlist.**

[Website](https://ethansk.github.io/agentic-dj/) · [Run locally](#run-it) · [Agent workflow](docs/agent-workflow.md)

Agentic DJ is a local listening desk for music discovery. An AI assistant can inspect music references you choose to share, research a batch of any size, and return verified track metadata. You listen through official players and mark **Keep**, **Pass**, or **Later**. The app turns those decisions into a provisional map of the genres and physical sound qualities you respond to. That evidence shapes the next batch—it is never permission to spend money.

This repository includes a ten-track calibration round spanning UK bass, garage, techno, dub, breakbeat, dancehall, and leftfield club music. It is designed for someone who can recognise the right bass, kick, groove, or feeling before they know the genre name. Every item has an official Bandcamp player and a source that was checked when the round was assembled.

## Why this exists

Recommendation feeds optimise for more listening. Agentic DJ optimises for a better personal crate:

- Your own playlists and DJ library can be stronger taste evidence than broad popularity.
- Keep / Pass decisions retain _why_ a record worked or failed.
- Genre and sound-trait signals remain provisional, visible, and correctable instead of silently becoming a recommendation bubble.
- Agents do the searching and verification; humans make the taste and spending decisions.
- The app stores private references and decisions locally, outside Git.
- A keeper is only a shortlist entry. There is no automatic checkout.

## Run it

You need [Node.js 22.13 or newer](https://nodejs.org/), npm, Git, and a modern browser.

```bash
git clone https://github.com/EthanSK/agentic-dj.git
cd agentic-dj
npm ci
npm start
```

Open [http://127.0.0.1:4371](http://127.0.0.1:4371). Stop the app with `Ctrl+C`.

Agentic DJ binds only to `127.0.0.1`. Do not expose it through a tunnel or deploy this local build: it has no multi-user authentication by design.

### Listen and decide

- Press **Play** in the track header or use the full player below it. Volume starts at 25%, and the volume and Keep sort are remembered.
- Browse with **← / →**. If paused, the next track stays paused; if playing, it continues into the next track. Use **P / K / L** for Pass / Keep / Later and **Z** to undo.
- The player stays on its loaded track when you browse Keep, Later, All or past sessions. Select a saved track and press **Load into player** to change it.
- Read the source label: a Spotify discovery is different from a new agent recommendation. Audio uses official Beatport or Bandcamp previews through Web Audio, without a Spotify embed.
- Use **Beginning / Middle / End** below the player to suggest where a track belongs. The agent can suggest a section; your choice overrides it. These are soft preferences, not fixed slots. Add **Your notes** and **Agent notes** under **Track notes**, then save; both travel with the record, CSV and private agent brief.
- **Keep** defaults to a suggested set order. Switch to newest or oldest by the date you kept each track. Full-track duration totals follow the selected list and filters.
- Session counts and CSV exports separate the current shopping list from older decisions. **Past sessions** keeps earlier history accessible. A gap longer than 14 days starts a new session on your next decision.
- Expanded taste clues show **this session** and **previous sessions** separately. Feedback tags and notes help explain why a track works.
- **Recent plays** remembers previews started in this browser tab. A manual reload restores the selected track without starting audio.

## Make it your own

1. Try the supplied demo, or give your preferred agent a few tracks, playlists or a read-only DJ-library export.
2. Listen, then choose Keep, Pass or Later. You do not need a genre name first.
3. Use **Ask your agent for more** to download the private brief. Ask for any number of tracks; ten is only the default.
4. Have the agent follow [the workflow](docs/agent-workflow.md), verify exact store recordings and previews, and return [crate JSON](docs/crate-format.md).
5. Import with **Append**. New tracks go after the unfinished queue; earlier tracks, rounds, sessions and decisions remain saved.
6. Export the current session's Keeps for a separate store comparison and purchase decision.

The app prepares an agent brief; it does not silently contact an AI service. A Keep is a listening choice, never permission to buy or change Rekordbox. Suggested set order is not a full-file beat-grid or transition check.

### Bring music references safely

Agentic DJ deliberately has no Spotify login, Rekordbox database access, or store credentials. Your assistant can work from exports you provide or inspect a local library read-only when you explicitly permit it. Keep those inputs outside this repository.

Useful evidence includes:

- recently saved tracks or selected playlists from a streaming service;
- a Rekordbox XML export or a read-only library report;
- tracks that worked in a previous set;
- Keep / Pass notes exported by this app; and
- a list of music you already own, used only for duplicate exclusion.

The public `.gitignore` excludes local database files, music files, private profiles, local exports, backups, and the outstanding-items ledger.

## Privacy and network behaviour

Private state lives under `.agentic-dj/`. The app uses a local D1/SQLite database. Browser local storage holds volume and sort preferences; tab session storage holds listening position and recent plays. There is no analytics or telemetry. State mutations use a revision check, so a stale tab cannot silently overwrite a newer decision.

The page makes these intentional third-party requests:

- cover artwork loads from the release’s original Bandcamp, Beatport or Spotify image host;
- when previews are enabled, the localhost server requests official Bandcamp preview metadata and audio;
- official Beatport samples load directly from Beatport; legacy Spotify records never create a Spotify player; and
- source / store links open the named external website when you click them.

The server validates the requested Bandcamp track ID and the returned `bcbits.com` stream address, relays the official 128 kbps preview to the same-origin page, and sends `Cache-Control: no-store`. The browser decodes previews in memory for Web Audio playback. Beatport previews use their public sample URL directly. Agentic DJ does not write preview audio to disk, offer an audio download, bypass provider limits, or retain the signed stream address.

Download a private-state JSON from **Tools** as an inspectable recovery snapshot. Automatic restoration is not provided; for a machine move, also stop the app and preserve the complete `.agentic-dj/` folder. Those files are private—do not attach them to a public issue.

## Updating safely

Check without changing files:

```bash
npm run update -- --check
```

To update, stop every Agentic DJ instance with `Ctrl+C`, then run:

```bash
npm run update
```

The updater:

- accepts only the canonical `EthanSK/agentic-dj` origin;
- refuses dirty source, a non-`main` branch, a running local server, non-fast-forward history, and incoming private-data paths;
- creates a recovery branch and a timestamped private-data backup;
- fast-forwards without `reset`, `clean`, forced checkout, or automatic stashing;
- runs `npm ci`, tests, type-checking, and a production build; and
- never starts the new version or performs a destructive rollback automatically.

If you maintain a fork, update it with your normal reviewed Git workflow. The built-in updater intentionally refuses alternate origins.

## Purchasing workflow

Observed prices are dated hints, not a claim that a store is cheapest. Tax, territory, format, remaster/version, album-vs-track pricing, and checkout currency can change the result.

A purchasing assistant should:

1. read the exported keepers;
2. compare the exact recording at Bandcamp, Beatport, Juno Download, Qobuz, or another legitimate store;
3. confirm lossless availability and DJ-useful metadata;
4. exclude music already owned;
5. present exact versions, formats, per-store prices, tax/fees, and the final total; and
6. wait for explicit approval before adding to a cart or buying.

See [the complete agent workflow](docs/agent-workflow.md).

## Development

```bash
npm ci
npm run dev
npm test
npm run typecheck
npm run build
npm run lint
```

The stack is React 19, Vinext/Vite, Cloudflare’s local runtime, D1/SQLite, Drizzle schema definitions, Tailwind CSS, and shadcn primitives. Schema changes go through `npm run db:generate` and must preserve existing local data.

- [Crate format](docs/crate-format.md)
- [Agent workflow and safety boundaries](docs/agent-workflow.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Development without interrupting a listener

`npm start` disables file watching and hot reload. Make and test changes in a separate checkout or staging directory; restart the listening server only when its preview is stopped. For an isolated development instance, explicitly enable live updates:

```bash
AGENTIC_DJ_HOT_RELOAD=1 AGENTIC_DJ_PORT=4379 npm start
```

Use a separate `AGENTIC_DJ_STATE_DIR` for test data. Run `npm test`, `npm run typecheck` and `npm run build` before installing changes. Never copy personal state into the public repository.

## License

Source-available under [Ethan Source-Available No-Sale Terms 1.0](LICENSE). You can use and modify the covered code, including internally at work, and share it without charge. Selling the software, modified versions, paid access, or bundles requires a separate commercial license. Earlier licenses and third-party rights remain in force. See [scope and release policy](LICENSING.md). Release artwork, recordings, artist names, and third-party player interfaces remain the property of their respective owners and are not covered by this software licence.
