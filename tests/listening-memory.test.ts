// Reloads must retain the selected recording and actual preview-start history,
// without accepting a stale cursor for another crate or unsafe storage input.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readListeningCursor,
  saveListeningCursor,
  recentPlays,
  rememberPlayedTrack,
} from '../lib/listening-memory.ts';

void test('a tab restores its recording and filter across reloads', () => {
  const data = new Map<string, string>();
  const store = () => ({
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
  });
  const cursor = {
    crateId: 'round-13',
    trackId: 'track-12',
    view: 'keep' as const,
  };
  saveListeningCursor(cursor, store);
  assert.deepEqual(readListeningCursor('round-13', store), cursor);
  assert.equal(readListeningCursor('round-14', store), null);
  rememberPlayedTrack('track-11', store);
  rememberPlayedTrack('track-12', store);
  rememberPlayedTrack('track-11', store);
  assert.deepEqual(
    recentPlays(store).map((p) => p.trackId),
    ['track-11', 'track-12'],
  );
});

void test('failed browser storage cannot break playback or selection', () => {
  const store = () => {
    throw new Error('no storage');
  };
  assert.equal(readListeningCursor('round', store), null);
  assert.deepEqual(recentPlays(store), []);
  assert.doesNotThrow(() => rememberPlayedTrack('track-11', store));
});
