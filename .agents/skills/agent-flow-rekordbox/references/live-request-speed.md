# Fast live playlist requests

Use this recipe for requests during a DJ session. The aim is a shorter measured request-to-ready interval, not advice to request tracks earlier. Keep the main skill's authority, recording identity, playback and retry safeguards.

## Prepare once, reuse during the session

- Identify the current computer, collection and local media roots before the live request loop. Build or refresh the existing private catalogue through a compatible read-only reader. Reuse its current schema/tooling; do not create a second catalogue, remote database or service.
- Keep the catalogue outside the public repository. It is a derived search index, not the owner of music metadata: Rekordbox remains authoritative. Retain source-library identity, recording IDs, native paths, analysis evidence and a generation/freshness marker. Do not copy one computer's IDs or paths to another as if they were interchangeable.
- Refresh at session start and after known collection imports, removals, relocations or analysis changes. Do not run full XML export, walk the whole audio tree, or recheck every recording on every spoken request. Playback/history writes alone are not a reason to rebuild the whole catalogue.
- Prepare the normal native playlist command and target context once. Record the currently verified app/window and controller route, but recheck live ownership before each UI mutation. Reuse installed reader dependencies and the active voice agent; no worker/service startup per request.

## Request to ready

1. Interpret the completed request against the current session: target playlist, new-versus-append operation, vibe, requested count/duration, exclusions and tempo. Reuse settled context. Ask only for a material unresolved ambiguity; do not add a confirmation to every ordinary request.
2. Search and rank the private catalogue locally. Apply known BPM, ownership, availability and prior-play constraints before curation. If model judgement is useful, give one bounded candidate batch to the current agent; do not make a network lookup or a model call for each track. Keep new-track discovery/download/analysis off this live path.
3. Preflight only the selected recordings in one current read transaction where supported: exact IDs/versions, still in the collection, local non-streaming paths, analysis and current destination identity. Batch duplicate-path checks rather than scanning the collection separately for every ID. Check readability and analysis files only for the selected set. A stale or missing match triggers a bounded refresh/search for that request; it never becomes an invented replacement or a false ready result.
4. Prepare one ordered UTF-8 playlist file or one verified native multi-selection. Finish and inspect the preflight result before the UI write. Use one native batch operation for a new playlist; avoid a separate import or UI round trip per recording. For append/update, use only a demonstrated native amendment route: repeated same-name file imports are not a proven update mechanism.
5. Use the currently observed native controls to submit the batch. Group independent observations into one tool call where safe, rather than inspecting each field in its own turn. Keep required state checks after menus, sheets and mutations; do not combine an unobserved safety gate with the action it gates. Read the Go to Folder sheet itself before entering the path.
6. Verify the exact target membership/order in one bounded readback and select/show that playlist through a supported UI route. Confirm current deck state while accounting for user actions. Stop once these checks establish the requested result; do not rescan unrelated playlists or regenerate the catalogue as ceremonial final checks. Retain enough before-state to check the changes the chosen operation could affect.
7. Report the result promptly with measured timing. If only the saved playlist was verified and the browser cannot show it, say it is saved but UI readiness is unverified. A recommendation, prepared file, successful click or database row alone is not a completed request-to-ready result.

Do not add fixed sleeps, polling daemons, artificial key delays or an automatic extra model round. Wait for actual readiness signals and use bounded fresh observations. When a controller repeatedly fails, use the known supported route or report the concrete limitation; do not spend a live request retrying unverified coordinate-event tricks.

## Tempo and BPM

- In a playlist request, “around 128 BPM” filters or ranks recordings by their known original tempo. Use an explicit range when supplied; otherwise prefer the closest eligible matches and report their actual BPM spread. Keep raw source units correct through the existing reader (some native schemas store hundredths of BPM).
- Missing BPM does not satisfy a requested range. Half/double-time relationships can inform selection when musically appropriate, but retain the original metadata and label the interpretation. Do not reanalyse or rewrite BPM to force a match.
- “Set the tempo” without an unambiguous deck/control target is not authority to move a playing deck's pitch, toggle sync or load a record. In playlist context, state that the requested tempo is being used for selection. If the user explicitly means playback control, resolve the affected deck and use the separately authorised playback workflow; preserve other decks and their audio.

## Measure the whole experience

Record these timestamps in existing private task state, with a monotonic clock for durations where available:

- request received/understood (identify whether speech capture/transcription is included);
- candidates selected;
- selected-track preflight complete;
- native batch submitted;
- target shown and exact membership/order verified;
- response delivered.

Report catalogue preparation separately, and disclose time waiting for the user. Keep initial/cold setup and repeated/warm requests separate. Compare the same request size, catalogue, app version, control route and start/end definition before claiming a before/after gain. Record failures and long-tail requests too; do not call a small successful sample a reliable latency guarantee.

### Existing evidence, not a new benchmark

The M1 three-track test on 2026-11-11 measured 35.1 seconds from its final baseline timestamp to saved-playlist readback. The visible-playlist and audition checks were not completed, and earlier setup was excluded. Recorded individual tool durations included a 0.917-second baseline call, a 2.234-second picker screenshot, a 0.636-second native Open call and a 0.738-second saved readback. These durations exclude intervening reasoning, inspection and other tool transitions; the Open call duration is not proof of the import's completion time.

That evidence supports reducing repeated setup and tool/model transitions, not claiming that Rekordbox itself took 35 seconds or that this recipe already meets a faster target. The active M5 owner must time comparable complete requests and finish the retained display, audition, amendment, collision/retry and concurrent-user checks. Faster partial output must not be reported as faster verified readiness.
