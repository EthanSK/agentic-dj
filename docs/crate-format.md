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

`schemaVersion` must be `1`. `round` is an optional positive integer. A crate contains 1–500 tracks, while the adaptive listening workflow normally imports exactly ten at a time. IDs are stable alphanumeric strings (hyphen and underscore are allowed), unique inside a crate, and must identify a recording/version—not merely a song composition.

Every track needs `artist`, `title`, `lane`, `reason`, `setRole`, `accessibility`, `sourceUrl`, and `sourceName`. `accessibility` is `start-here`, `deeper`, or `curveball`.

`reason` and `setRole` are subjective suggestions. Do not state invented audio measurements as facts.

`genres` and `traits` are optional lists of up to six short labels each. Genres explain the broad musical vocabulary; traits describe audible qualities such as sub weight, kick shape, swing, vocals, darkness, or polish. Treat both as working hypotheses. They support the visible Earprint and must not pretend to be machine-measured audio analysis.

## Official previews

`preview` is optional, but a useful listening crate should include it. The app accepts only:

- a numeric Bandcamp track ID; or
- a 22-character Spotify track ID.

Arbitrary iframe URLs are rejected. Do not use a stream rip, file-sharing URL, unofficial upload, or a fabricated provider ID.

Bandcamp previews load at a quiet default level through the app's Web Audio player. Its volume control is live and its scrubber does not reload the preview. Spotify IDs are shown as explicit Spotify links rather than embedded players, because cross-origin media elements can claim hardware media keys.

## Sources, prices, and artwork

Source URLs are limited to recognised HTTPS music platforms. Artwork is limited to official Bandcamp or Spotify image hosts. This prevents imported crates from becoming arbitrary trackers or phishing-link collections.

A saved price must include currency, `fixed` or `minimum`, `track` or `release`, and the exact check time. Omit `price` when it cannot be verified. Never convert album pricing into a track price or claim “cheapest” from one observed store.

Optional fields include `seconds`, `bpm`, `alternateBpm`, `musicalKey`, `tempoNote`, `released`, `label`, `isrc`, `caution`, and `suggestedBy`. `alternateBpm` is useful for half-time/double-time interpretations. Use `tempoNote` for a short, sourced uncertainty such as conflicting retailer BPMs. Add BPM, key, dates, labels and ISRC only when a reliable source supports them; omit facts that cannot be verified.

## Identity and re-imports

An import with an existing ID may refresh metadata only when normalised artist and title still identify the same recording. A conflicting identity is rejected so an old Keep vote cannot silently attach itself to a different track.

**New active crate** preserves earlier tracks, votes, and history locally while changing the queue. **Append** adds tracks to the current queue. Neither import deletes decisions.
