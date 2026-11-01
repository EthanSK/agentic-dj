// Keep sorting must never reorder the unheard crate; exports and visible lists
// share the same pure ordering, and duration totals use full recordings.
import assert from 'node:assert/strict';
import test from 'node:test';
import demo from '../data/demo-crate.json' with { type: 'json' };
import { applyCommand, initialPayload, shortlistCsv } from '../lib/domain.ts';
import {
  readKeepSort,
  saveKeepSort,
  sortKeepTracks,
  totalDuration,
} from '../lib/keep-order.ts';
import { allSessionsSummary } from '../lib/sessions.ts';
import { tasteMap } from '../lib/domain.ts';

void test('recommended Keep order is separate from decision dates and never mutates the queue', () => {
  let state = initialPayload(demo);
  const [a, b] = demo.tracks;
  for (const [i, track] of [a, b].entries())
    state = applyCommand(
      state,
      {
        type: 'vote',
        trackId: track.id,
        verdict: 'keep',
        requestId: `ordered-vote-${i}`,
      },
      `2026-11-0${i + 1}T00:00:00Z`,
    );
  const before = structuredClone(state);
  state = applyCommand(state, {
    type: 'record-set-order',
    requestId: 'ordered-set-context',
    tracks: [
      {
        id: a.id,
        artist: a.artist,
        title: a.title,
        setPlacement: { rank: 20, note: 'Later lift' },
      },
      {
        id: b.id,
        artist: b.artist,
        title: b.title,
        setPlacement: { rank: 10, note: 'Warm opening' },
      },
    ],
  });
  const tracks = [state.tracks[a.id], state.tracks[b.id]];
  assert.deepEqual(
    sortKeepTracks(tracks, state.votes, 'recommended').map((t) => t.id),
    [b.id, a.id],
  );
  assert.deepEqual(
    sortKeepTracks(tracks, state.votes, 'oldest').map((t) => t.id),
    [a.id, b.id],
  );
  assert.deepEqual(
    sortKeepTracks(tracks, state.votes, 'newest').map((t) => t.id),
    [b.id, a.id],
  );
  assert.deepEqual(
    tracks.map((t) => t.id),
    [a.id, b.id],
  );
  assert.deepEqual(state.crate, before.crate);
  assert.deepEqual(state.votes, before.votes);
  assert.deepEqual(state.history, before.history);
  assert.deepEqual(state.sessions, before.sessions);
  const csv = shortlistCsv(state, allSessionsSummary(state));
  assert.ok(csv.indexOf(b.title) < csv.indexOf(a.title));
  const metadataRefresh = structuredClone(demo);
  for (const track of metadataRefresh.tracks)
    delete (track as Partial<typeof track>).setPlacement;
  const refreshed = applyCommand(state, {
    type: 'import',
    mode: 'append',
    crate: metadataRefresh,
    requestId: 'ordered-refresh-context',
  });
  assert.deepEqual(
    refreshed.tracks[a.id].setPlacement,
    state.tracks[a.id].setPlacement,
  );
});

void test('duration totals count full recordings and disclose missing lengths', () => {
  assert.deepEqual(totalDuration([{ seconds: 3600 }, { seconds: 90 }, {}]), {
    label: '1h 2m',
    missing: 1,
  });
  assert.deepEqual(totalDuration([]), { label: '0m', missing: 0 });
});

void test('Keep sort survives reload and unavailable storage', () => {
  let stored: string | null = null;
  const access = () => ({
    getItem: () => stored,
    setItem: (_key: string, value: string) => {
      stored = value;
    },
  });
  assert.equal(readKeepSort(access), 'recommended');
  saveKeepSort('newest', access);
  assert.equal(readKeepSort(access), 'newest');
  assert.equal(
    readKeepSort(() => {
      throw new Error('denied');
    }),
    'recommended',
  );
});

void test('taste summaries can isolate current and earlier decisions', () => {
  let state = initialPayload(demo);
  const [a, b] = demo.tracks;
  state.tracks[a.id].traits = ['current-only'];
  state.tracks[b.id].traits = ['past-only'];
  for (const t of [a, b])
    state = applyCommand(state, {
      type: 'vote',
      trackId: t.id,
      verdict: 'keep',
      requestId: `taste-scope-${t.id}`,
    });
  const current = tasteMap(state, new Set([a.id]));
  assert.equal(current.decided, 1);
  assert.ok(current.positive.some((x) => x.label === 'current-only'));
  assert.ok(!current.positive.some((x) => x.label === 'past-only'));
});
