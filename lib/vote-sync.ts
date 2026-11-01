import type { Payload } from './types.ts';

// An agent may refresh metadata while the listener is playing. Retry a stale
// vote once only if that recording and its saved decision have not changed.
export function canRetryVote(
  body: Record<string, unknown>,
  before: Pick<Payload, 'tracks' | 'votes'>,
  fresh: Pick<Payload, 'tracks' | 'votes'>,
): boolean {
  if (body.type !== 'vote' || typeof body.trackId !== 'string') return false;
  const id = body.trackId;
  const oldTrack = before.tracks[id];
  const newTrack = fresh.tracks[id];
  return (
    !!oldTrack &&
    !!newTrack &&
    oldTrack.artist === newTrack.artist &&
    oldTrack.title === newTrack.title &&
    JSON.stringify(before.votes[id] ?? null) ===
      JSON.stringify(fresh.votes[id] ?? null)
  );
}
