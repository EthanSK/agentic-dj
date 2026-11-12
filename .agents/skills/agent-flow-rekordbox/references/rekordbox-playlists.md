# Rekordbox playlist operations

Read when using a native playlist-file import or recovering from limited UI controls. Keep normal playlist edits agent-controlled; do not bypass the application with database writes.

For live requests, first use [Fast live playlist requests](live-request-speed.md) to reuse session preparation, bound selected-track checks, handle BPM requests and measure request-to-ready time.

## Native import of existing recordings

1. Resolve each recording against the current Rekordbox collection and its readable local full file. Verify existing analysis. A read-only database adapter must use a read-only connection and query-only mode, not a default writable ORM session. Keep database keys and private rows out of logs and public files.
2. Check the intended playlist name against current playlists and capture the exact track IDs and order. Keep this plan private. For a new playlist, create a task-private UTF-8 `.m3u8` containing only those existing file paths in the planned order. New audio imports and analysis are outside this route.
3. In Rekordbox, use the observed **File → Import → Import Playlist** command. In the native file chooser, navigate to that exact file. On macOS, **Command–Shift–G** opens a Go to Folder sheet; inspect the new sheet separately, set its path field, confirm it, then verify the selected filename and contents before **Open**. Do not act on a stale window or substitute the parent dialog's filename field for the sheet's path field.
4. Reconcile the resulting native playlist by exact existing record IDs and saved order. Verify no new collection IDs were introduced and no unrelated playlist identity/name/parent/order changed. Do not blindly repeat import on timeout: first check whether the playlist was already created.
5. Separately display the playlist in Rekordbox and inspect every visible row needed to establish its contents. A saved database result proves native creation and ordering, but it does not by itself prove that the expected playlist is selected on screen or that tracks play.

Do not assume importing another file with the same name updates an existing playlist. That behaviour has not been validated here; use a verified native amendment operation or report the limit. Keep a requested new playlist and a requested update distinct.

## Verified boundary and recovery

Self-improved — 2026-11-11: retain the native import route so future agents can create a playlist when browser controls are unavailable. In the requested live validation on Rekordbox 7.2.8 for macOS, native import created a three-track practice playlist from pre-existing local analysed files. Read-only verification confirmed exact IDs/order, zero new collection IDs, and unchanged existing playlist identity/name/parent/order. Displaying the new playlist and auditioning it were not completed before the user's machine handoff; they remain acceptance checks, not claimed successes.

The same session's full-library XML export did not yield a verified output file and spent minutes at a displayed 100 percent. Do not make full export a prerequisite for every live request; prefer an existing current inventory or a compatible read-only reader. This observation does not establish the cause or prove a general Rekordbox export bug.

Native menu actions and file-chooser path entry worked. App-targeted coordinate-event experiments did not change the browser selection; do not ship them as a proven controller or retry them indefinitely. If safe control of the browser/player is unavailable, leave the saved playlist intact, report that exact boundary, and resume through a supported controller on the target machine. Never claim an audition from a successful menu action, a saved playlist or a static waveform.
