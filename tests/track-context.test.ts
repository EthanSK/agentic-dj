// Track context is independent from listening decisions. Verify ownership,
// validation, exports and the soft blend used by recommended Keep ordering.
import assert from 'node:assert/strict';
import test from 'node:test';
import demo from '../data/demo-crate.json' with { type: 'json' };
import {
  applyCommand,
  initialPayload,
  agentBrief,
  shortlistCsv,
  validateCrate,
} from '../lib/domain.ts';
import { allSessionsSummary } from '../lib/sessions.ts';
import { sortKeepTracks } from '../lib/keep-order.ts';
const track = demo.tracks[0];

void test('agent section suggestions preserve user position and validate the three choices', () => {
  const initial = applyCommand(initialPayload(demo), {
    type: 'update-track-context',
    trackId: track.id,
    setPosition: 90,
    requestId: 'section-user-001',
  });
  const entry = {
    id: track.id,
    artist: track.artist,
    title: track.title,
    setPlacement: { rank: 20, note: 'A quiet opener', section: 'beginning' },
  };
  const next = applyCommand(initial, {
    type: 'record-set-order',
    tracks: [entry],
    requestId: 'section-agent-001',
  });
  assert.equal(next.tracks[track.id].setPlacement?.section, 'beginning');
  assert.equal(next.tracks[track.id].setPosition, 90);
  assert.deepEqual(next.votes, initial.votes);
  assert.deepEqual(next.crate, initial.crate);
  const cleared = applyCommand(next, {
    type: 'update-track-context',
    trackId: track.id,
    setPosition: null,
    requestId: 'section-clear-001',
  });
  assert.equal(cleared.tracks[track.id].setPosition, undefined);
  assert.equal(cleared.tracks[track.id].setPlacement?.section, 'beginning');
  assert.throws(() =>
    applyCommand(initial, {
      type: 'record-set-order',
      tracks: [
        { ...entry, setPlacement: { ...entry.setPlacement, section: 'peak' } },
      ],
      requestId: 'section-invalid-001',
    }),
  );
});

void test('track notes and position save without deciding or replacing any queue/history', () => {
  const initial = initialPayload(demo);
  const next = applyCommand(initial, {
    type: 'update-track-context',
    trackId: track.id,
    userNotes: 'Quite near the end',
    agentNotes: 'A gentle closing option',
    setPosition: 90,
    requestId: 'context-save-001',
  });
  assert.equal(next.tracks[track.id].notes?.user, 'Quite near the end');
  assert.equal(next.tracks[track.id].notes?.agent, 'A gentle closing option');
  assert.equal(next.tracks[track.id].setPosition, 90);
  for (const key of [
    'crate',
    'votes',
    'history',
    'sessions',
    'profile',
    'queuedRounds',
  ] as const)
    assert.deepEqual(next[key], initial[key]);
  assert.equal(initial.tracks[track.id].setPosition, undefined);
  assert.match(agentBrief(next), /Quite near the end/); // Unvoted context is included too.
  assert.match(agentBrief(next), /soft preferences, not fixed slots/);
  const partial = applyCommand(next, {
    type: 'update-track-context',
    trackId: track.id,
    agentNotes: 'Keep the groove',
    requestId: 'context-save-002',
  });
  assert.equal(partial.tracks[track.id].notes?.user, 'Quite near the end');
  assert.equal(partial.tracks[track.id].setPosition, 90);
  const cleared = applyCommand(partial, {
    type: 'update-track-context',
    trackId: track.id,
    setPosition: null,
    requestId: 'context-save-003',
  });
  assert.equal(cleared.tracks[track.id].setPosition, undefined);
  assert.equal(cleared.tracks[track.id].notes?.user, 'Quite near the end');
});

void test('invalid track context is rejected atomically', () => {
  const initial = initialPayload(demo);
  const before = structuredClone(initial);
  for (const setPosition of [-1, 101, 50.5, '90', undefined])
    assert.throws(() =>
      applyCommand(initial, {
        type: 'update-track-context',
        trackId: track.id,
        userNotes: 'must not leak',
        setPosition,
        requestId: 'context-invalid-001',
      }),
    );
  assert.throws(() =>
    applyCommand(initial, {
      type: 'update-track-context',
      trackId: 'missing',
      setPosition: 90,
      requestId: 'context-invalid-002',
    }),
  );
  assert.throws(() =>
    applyCommand(initial, {
      type: 'update-track-context',
      trackId: track.id,
      userNotes: 'x'.repeat(4001),
      requestId: 'context-invalid-003',
    }),
  );
  assert.deepEqual(initial, before);
});

void test('reimport preserves user context while refreshing agent notes and exports all fields', () => {
  let state = applyCommand(initialPayload(demo), {
    type: 'update-track-context',
    trackId: track.id,
    userNotes: '=2+2',
    agentNotes: 'First suggestion',
    setPosition: 90,
    requestId: 'context-export-001',
  });
  const refresh = validateCrate({
    ...demo,
    tracks: [
      {
        ...track,
        notes: { user: 'overwrite attempt', agent: 'Revised suggestion' },
        setPosition: 10,
      },
    ],
  });
  state = applyCommand(state, {
    type: 'import',
    mode: 'append',
    crate: refresh,
    requestId: 'context-export-002',
  });
  assert.deepEqual(state.tracks[track.id].notes, {
    user: '=2+2',
    agent: 'Revised suggestion',
  });
  assert.equal(state.tracks[track.id].setPosition, 90);
  state = applyCommand(state, {
    type: 'vote',
    trackId: track.id,
    verdict: 'keep',
    requestId: 'context-export-003',
  });
  const csv = shortlistCsv(state, allSessionsSummary(state));
  assert.match(
    csv,
    /"Your track notes","Agent track notes","Preferred set position percent"/,
  );
  assert.match(csv, /"'=2\+2","Revised suggestion","90"/);
});

void test('set hints influence recommended order without becoming fixed slots or affecting date order', () => {
  const tracks = validateCrate(demo)
    .tracks.slice(0, 6)
    .map((t, i) => ({ ...t, setPlacement: { rank: (i + 1) * 10, note: '' } }));
  const votes = Object.fromEntries(
    tracks.map((t, i) => [
      t.id,
      {
        verdict: 'keep' as const,
        tags: [],
        note: '',
        at: `2026-11-01T00:00:0${i}Z`,
      },
    ]),
  );
  const [first] = tracks;
  const hinted = tracks.map((t) =>
    t.id === first.id ? { ...t, setPosition: 100 } : t,
  );
  const result = sortKeepTracks(hinted, votes, 'recommended');
  assert.ok(result.findIndex((t) => t.id === first.id) > 0);
  assert.notEqual(result.at(-1)?.id, first.id); // Soft, not pinned to last place.
  assert.deepEqual(
    sortKeepTracks(hinted, votes, 'oldest').map((t) => t.id),
    tracks.map((t) => t.id),
  );
  assert.deepEqual(
    tracks.map((t) => t.setPosition),
    Array(6).fill(undefined),
  );
});
