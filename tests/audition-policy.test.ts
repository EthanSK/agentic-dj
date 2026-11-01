// Regression checks for Ethan's append-only, verified-preview listening flow.
// All fixtures are synthetic; no request is made to a music store.
import assert from 'node:assert/strict';
import test from 'node:test';
import demo from '../data/demo-crate.json' with { type: 'json' };
import {
  applyCommand,
  initialPayload,
  keptTracks,
  agentBrief,
  validateCrate,
} from '../lib/domain.ts';
import { isAuditionReady } from '../lib/preview-source.ts';
import {
  listSessionSummaries,
  validateStoredQueue,
  SessionDataError,
} from '../lib/sessions.ts';
import type { Crate, Track } from '../lib/types.ts';
const demoCrate = validateCrate(demo);
const at = '2026-11-01T12:00:00.000Z';
const track: Track = {
  ...demoCrate.tracks[0],
  id: 'verified-one',
  sourceUrl: 'https://www.beatport.com/track/example/100',
  preview: { provider: 'beatport', id: '00000000-0000-4000-8000-000000000001' },
};
const crate: Crate = {
  ...demoCrate,
  id: 'current-round',
  tracks: [track, { ...demoCrate.tracks[1], id: 'old-unverified' }],
};
const run = (
  state: ReturnType<typeof initialPayload>,
  body: Record<string, unknown>,
  id: string,
) => applyCommand(state, { ...body, requestId: id }, at);
void test('append preserves the existing queue, current selection identity and decisions', () => {
  let s = initialPayload(crate);
  s = run(
    s,
    { type: 'vote', trackId: track.id, verdict: 'keep' },
    'policy-vote',
  );
  const before = structuredClone(s);
  const more: Crate = {
    ...crate,
    id: 'additional-round',
    round: 2,
    tracks: [{ ...track, id: 'verified-two', title: 'Another track' }],
  };
  s = run(s, { type: 'import', mode: 'append', crate: more }, 'policy-append');
  assert.equal(s.crate.id, before.crate.id);
  assert.deepEqual(s.crate.trackIds, [
    ...before.crate.trackIds,
    'verified-two',
  ]);
  assert.deepEqual(s.votes, before.votes);
  assert.deepEqual(s.history, before.history);
  assert.deepEqual(s.sessions, before.sessions);
  assert.match(agentBrief(s, Date.parse(at)), /mode `append`/);
});
void test('current buying scope excludes unverified previews without erasing global Keeps', () => {
  let s = initialPayload(crate);
  s = run(
    s,
    { type: 'vote', trackId: track.id, verdict: 'keep' },
    'policy-keep-one',
  );
  s = run(
    s,
    { type: 'vote', trackId: 'old-unverified', verdict: 'keep' },
    'policy-keep-old',
  );
  const savedVotes = structuredClone(s.votes);
  s = run(
    s,
    { type: 'profile', profile: { ...s.profile, requireBeatport: true } },
    'policy-require',
  );
  assert.deepEqual(s.votes, savedVotes);
  assert.equal(keptTracks(s).length, 2);
  assert.deepEqual(listSessionSummaries(s, Date.parse(at))[0].keptIds, [
    track.id,
  ]);
  const bad = {
    ...crate,
    id: 'bad-round',
    tracks: [{ ...demoCrate.tracks[2], id: 'new-unverified' }],
  };
  assert.throws(() =>
    run(s, { type: 'import', mode: 'append', crate: bad }, 'policy-reject'),
  );
  assert.deepEqual(s.votes, savedVotes);
});
void test('audition readiness rejects missing previews and search links', () => {
  assert.equal(isAuditionReady(track, true), true);
  assert.equal(isAuditionReady(undefined, true), false);
  assert.equal(isAuditionReady({ ...track, preview: undefined }, true), false);
  assert.equal(
    isAuditionReady(
      { ...track, sourceUrl: 'https://www.beatport.com/search?q=example' },
      true,
    ),
    false,
  );
  assert.equal(
    isAuditionReady(
      {
        ...track,
        sourceUrl: 'https://beatport.com.example.com/track/example/100',
      },
      true,
    ),
    false,
  );
  assert.equal(isAuditionReady(demoCrate.tracks[0]), true);
  assert.equal(isAuditionReady(demoCrate.tracks[0], true), false);
});
void test('duplicate saved queued-round IDs are rejected', () => {
  const s = initialPayload(crate);
  const q = { ...s.crate, queuedAt: at };
  assert.throws(() => validateStoredQueue([q, q], s.tracks), SessionDataError);
});
