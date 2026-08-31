# Crate format

Agentic DJ accepts a bounded JSON document. The server validates it again during import; client-side validation is only an early preview.

```json
{
  "schemaVersion": 1,
  "id": "my-crate-001",
  "title": "Dopamine without the obvious bits",
  "description": "Jungle, broken beat and colourful bass.",
  "tracks": [
    {
      "id": "bc-349304401",
      "artist": "Halogenix",
      "title": "Independent",
      "lane": "Rolling funk & colour",
      "reason": "A short original explanation of why it may fit.",
      "setRole": "warm rolling opener",
      "accessibility": "start-here",
      "preview": { "provider": "bandcamp", "id": "349304401" },
      "artwork": "https://f4.bcbits.com/img/example.jpg",
      "seconds": 315,
      "sourceUrl": "https://halogenix.bandcamp.com/track/independent",
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

`schemaVersion` must be `1`. A crate contains 1–500 tracks. IDs are stable alphanumeric strings (hyphen and underscore are allowed), unique inside a crate, and must identify a recording/version—not merely a song composition.

Every track needs `artist`, `title`, `lane`, `reason`, `setRole`, `accessibility`, `sourceUrl`, and `sourceName`. `accessibility` is `start-here`, `deeper`, or `curveball`.

`reason` and `setRole` are subjective suggestions. Do not state invented audio measurements as facts.

## Official previews

`preview` is optional, but a useful listening crate should include it. The app accepts only:

- a numeric Bandcamp track ID; or
- a 22-character Spotify track ID.

Arbitrary iframe URLs are rejected. Do not use a stream rip, file-sharing URL, unofficial upload, or a fabricated provider ID.

## Sources, prices, and artwork

Source URLs are limited to recognised HTTPS music platforms. Artwork is limited to official Bandcamp or Spotify image hosts. This prevents imported crates from becoming arbitrary trackers or phishing-link collections.

A saved price must include currency, `fixed` or `minimum`, `track` or `release`, and the exact check time. Omit `price` when it cannot be verified. Never convert album pricing into a track price or claim “cheapest” from one observed store.

Optional fields include `bpm`, `released`, `label`, `isrc`, `caution`, and `suggestedBy`. Add BPM, dates, labels and ISRC only when a reliable source supports them.

## Identity and re-imports

An import with an existing ID may refresh metadata only when normalised artist and title still identify the same recording. A conflicting identity is rejected so an old Keep vote cannot silently attach itself to a different track.

**New active crate** preserves earlier tracks, votes, and history locally while changing the queue. **Append** adds tracks to the current queue. Neither import deletes decisions.
