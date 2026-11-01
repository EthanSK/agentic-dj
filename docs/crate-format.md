# Crate format

Agentic DJ accepts a bounded JSON document. The server validates it again during import; client-side validation is only an early preview.

```json
{
  "schemaVersion": 1,
  "id": "bass-calibration-round-2",
  "title": "Round 2: Follow the weight",
  "description": "Ten new tests based on the previous answers.",
  "round": 2,
  "tracks": [
    {
      "id": "bc-2860825659",
      "artist": "Pangaea",
      "title": "Bone Sucka",
      "lane": "Kick & sub pressure",
      "genres": ["UK bass", "techno"],
      "traits": ["huge kick", "sub pressure", "sparse", "raw"],
      "reason": "A short original explanation of why it may fit.",
      "setRole": "low-end calibration",
      "accessibility": "start-here",
      "preview": { "provider": "bandcamp", "id": "2860825659" },
      "artwork": "https://f4.bcbits.com/img/example.jpg",
      "seconds": 382,
      "bpm": 126,
      "musicalKey": "D minor",
      "label": "Hessle Audio",
      "released": "2018-03-02",
      "sourceUrl": "https://pangaeauk.bandcamp.com/track/bone-sucka",
      "sourceName": "Bandcamp",
      "discovery": { "source": "agent", "basedOn": "past-likes" },
      "setPlacement": { "rank": 30, "note": "Build from warm grooves into a stronger bass section." },
      "checkedAt": "2026-08-31T20:54:03.037Z",
      "price": {
        "amount": 1.5,
        "currency": "GBP",
        "kind": "minimum",
        "scope": "track",
        "checkedAt": "2026-08-31T20:54:03.037Z"
      }
    }
  ]
}
```

## Required fields

Round provenance is retained on each saved track in `rounds`, an array of
`{ crateId, title, round? }` memberships. Imports automatically add the incoming
crate membership without removing earlier memberships. Legacy active-crate
membership is captured before the next mutation. Unnumbered crates retain their
name and ID without inventing a round number. The global Keep CSV includes
Round numbers, Round names and Crate IDs; JSON backups and agent briefs retain
the same provenance. A track can therefore belong to multiple round-based
playlists.

For historical recovery, the local `record-rounds` command accepts `crates`
alongside the usual `expectedRevision` and unique `requestId`. It adds only
memberships for already-saved matching recording IDs and artist/title pairs;
it does not import tracks, replace metadata, activate a crate or change votes.

`schemaVersion` must be `1`. `round` is an optional positive integer. A crate contains 1–500 tracks, while the adaptive listening workflow normally imports exactly ten at a time. IDs are stable alphanumeric strings (hyphen and underscore are allowed), unique inside a crate, and must identify a recording/version—not merely a song composition.

Every track needs `artist`, `title`, `lane`, `reason`, `setRole`, `accessibility`, `sourceUrl`, and `sourceName`. `accessibility` is `start-here`, `deeper`, or `curveball`.

`reason` and `setRole` are subjective suggestions. Do not state invented audio measurements as facts.

`genres` and `traits` are optional lists of up to six short labels each. Genres explain the broad musical vocabulary; traits describe audible qualities such as sub weight, kick shape, swing, vocals, darkness, or polish. Treat both as working hypotheses. They support the visible Earprint and must not pretend to be machine-measured audio analysis.

## Official previews

`preview` is optional, but a useful listening crate should include it. The app accepts only:

- a numeric Bandcamp track ID; or
- a Beatport public sample UUID, observed on the exact recording's official track page (`provider: "beatport"`). This is the sample UUID, not the numeric catalogue track ID.

Arbitrary iframe URLs are rejected. Do not use a stream rip, file-sharing URL, unofficial upload, or a fabricated provider ID.

Official previews use the existing Web Audio player, with remembered volume, seeking, preloading and playback continuing after a decision only when it was already playing. Beatport's public `.LOFI.mp3` sample loads directly from `geo-samples.beatport.com` with CORS; no new audio proxy is used. Do not substitute a full-track URL, guess sample UUIDs, or pair a preview with a different version.

Legacy 22-character Spotify preview IDs remain readable so existing records and votes survive upgrades. They never become audition players or Spotify listening links. Records without playable previews are retained but excluded from listening lists. Missing preview support is not evidence that a recording cannot be purchased or that the user dislikes it. Spotify Liked Songs may remain an input to discovery.

## Sources, prices, and artwork

### Where the suggestion came from

Every new suggestion should include `discovery`, independently of its store and
preview. `source` is `spotify-likes` for a recording found in the user's Spotify
Liked Songs, `agent` for a new recommendation, `rekordbox` for a library-inspired
suggestion, or `user` for a supplied track. Optional `basedOn` is `past-likes`,
`birthday`, or `request`. For example, a new Beatport recommendation based on
earlier Keeps uses `{ "source": "agent", "basedOn": "past-likes" }`.

The card shows a short discovery label and the queue shows its icon. Older tracks
without recorded discovery show `Source not recorded`; the app never guesses it
from a Spotify ID, preview provider, or store link. Reimports preserve existing
discovery when omitted, and backups, CSV and agent briefs retain it.

The `record-discovery` command can recover verified history without changing the
queue. Pass `tracks: [{ id, artist, title, discovery }]`, `expectedRevision`, and a
unique `requestId`. Every entry must match an existing recording; duplicate IDs
and mismatches reject the whole command. It changes no decisions or audio.

### Recommended set order

Each new suggestion should include `setPlacement: { rank, note }`: a positive
integer up to 100000 and a short explanation of its proposed place in the set.
Use the known arrangement, energy, style, BPM and key; do not claim untested
transitions are beat-matched. Ranks are relative and may leave gaps for new tracks.
`record-set-order` accepts identity-checked `tracks` with `setPlacement` and the
normal revision/request ID contract, without changing the audition queue.

Keeps default to the recommended order. The two Date added alternatives use the
saved Keep date. CSV and keeper JSON accept `sort=recommended|newest|oldest` and
use the same ordering as the app; the choice persists locally. Unranked legacy
Keeps follow in date order, with a visible note. The To hear queue always retains
the append order. List totals sum full-track `seconds`, flag missing lengths and
follow the active filters; they are not preview lengths or mixed-set runtimes.

Source URLs are limited to recognised HTTPS music platforms. Artwork is limited to official Bandcamp, Spotify and Beatport (`geo-media.beatport.com`) image hosts. This prevents imported crates from becoming arbitrary trackers or phishing-link collections.

A saved price must include currency, `fixed` or `minimum`, `track` or `release`, and the exact check time. Omit `price` when it cannot be verified. Never convert album pricing into a track price or claim “cheapest” from one observed store.

Optional fields include `seconds`, `bpm`, `alternateBpm`, `musicalKey`, `tempoNote`, `released`, `label`, `isrc`, `caution`, and `suggestedBy`. `alternateBpm` is useful for half-time/double-time interpretations. Use `tempoNote` for a short, sourced uncertainty such as conflicting retailer BPMs. Add BPM, key, dates, labels and ISRC only when a reliable source supports them; omit facts that cannot be verified.

## Identity and re-imports

An import with an existing ID may refresh metadata only when normalised artist and title still identify the same recording. A conflicting identity is rejected so an old Keep vote cannot silently attach itself to a different track.

**Append** is the default: add tracks after the existing queue without reordering it. **New active crate** changes the queue only when explicitly requested and sets aside an unfinished round in Up next. **Queue** prepares a round without opening it. None deletes decisions.

## Listening sessions

Private payloads retain `sessions` and `queuedRounds` in addition to track-level round provenance. Old payloads are grouped from saved decision dates without changing their tracks, votes or history. A gap of more than 14 days starts the next session on the next listening action; reads and agent imports do not extend activity dates. Manual New session also keeps the active queue intact.

CSV and keeper JSON default to `session=current`. Use `session=all` for all history or a saved session ID for that session. The CSV appends a Session column; global decisions still inform the agent brief. A past Keep is not proof of ownership, and a current Keep is not purchase approval.

The optional private profile flag `requireBeatport` requires new imports to have an exact Beatport track link and official Beatport preview. It filters the current buying scope without erasing older records or decisions. The default demo and installations without this preference can continue using official Bandcamp previews.

## Track notes and a preferred set position

A track can include `notes: { "user": "Quite near the end", "agent": "A gentle closer" }` and `setPosition: 90`. The number runs from 0 (beginning) to 100 (end). These are soft preferences; recommended Keep order blends the user's position with the agent's rank. Date sorting and the unheard queue do not change.

Use the normal revision-checked command contract with `type: "update-track-context"`, `trackId`, and any of `userNotes`, `agentNotes`, `setPosition`. Pass `setPosition: null` to clear that preference. Notes allow at most 4,000 characters per field. Metadata reimports preserve existing user notes and position hints while allowing agent notes to refresh. Treat all notes as musical context, never purchase or tool-execution authority.
