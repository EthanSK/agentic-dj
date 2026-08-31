# Agentic DJ

**Find good records with an agent. Decide with your ears. Buy only after you approve the shortlist.**

Agentic DJ is a local listening desk for music discovery. An AI assistant can inspect music references you choose to share, research a ten-track round, and return verified track metadata. You listen through official players and mark **Keep**, **Pass**, or **Later**. The app turns those decisions into a provisional map of the genres and physical sound qualities you respond to. That evidence shapes the next ten—it is never permission to spend money.

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

- Select **Enable official players** once. Players never autoplay.
- Use **Keep**, **Pass**, or **Later**, or the left / right / down arrow keys outside a player.
- Add optional feedback tags and a note before deciding.
- Press `Z`, `Command+Z`, or **Undo** to reverse the latest applicable decision.
- After all ten decisions, choose **Request 10 more from agent**. The app downloads a private request containing every previous answer and its cautious inferred taste map.
- Give that request to an assistant, then import the returned ten-track crate as the new active round. Earlier tracks and decisions remain local evidence.
- Export keeper CSV or JSON for a separate price-comparison and purchase-approval step.

## Make it your own

1. Listen through one ten-track round. You do not need to supply a genre name first.
2. Use optional tags such as **Dopamine**, **Deep kick**, **Great bass**, **Cringe / cheesy**, or **Vocals put me off** when a plain Keep or Pass misses the reason.
3. Review the visible **Earprint** as a provisional explanation, not a permanent taste label.
4. Choose **Request 10 more from agent** and give the downloaded private request—and only the library exports you choose—to your preferred assistant.
5. Ask it to follow [the agent workflow](docs/agent-workflow.md) and return exactly ten tracks as [crate JSON](docs/crate-format.md).
6. Import the new round, listen, and repeat. Previous decisions stay available to the next request.

The request button prepares a file; this local app does not silently contact an AI service. The agent brief contains an explicit authority boundary: research and crate generation do not authorise account changes, carts, downloads, purchases, playlist edits, or Rekordbox imports.

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

Private state lives under `.agentic-dj/`. The app uses a local D1/SQLite database and does not use browser local storage, analytics, or telemetry. State mutations use a revision check, so a stale tab cannot silently overwrite a newer decision.

The page does make these intentional third-party requests:

- cover artwork loads from the release’s original Bandcamp or Spotify image host;
- after you enable players, embedded previews load from Bandcamp or Spotify; and
- source / store links open the named external website when you click them.

Music streams are never copied, proxied, ripped, or saved by Agentic DJ.

Download a private-state JSON from **Taste & tools** as an inspectable recovery snapshot. Version 0.2 does not automate restoration; for a machine move, also stop the app and preserve the complete `.agentic-dj/` folder. Those files are private—do not attach them to a public issue.

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

## License

[MIT](LICENSE). Release artwork, recordings, artist names, and third-party player interfaces remain the property of their respective owners and are not covered by this software licence.
