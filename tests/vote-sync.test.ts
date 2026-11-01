import assert from 'node:assert/strict';
import test from 'node:test';
import demo from '../data/demo-crate.json' with { type: 'json' };
import { initialPayload } from '../lib/domain.ts';
import { canRetryVote } from '../lib/vote-sync.ts';

void test('metadata-only conflicts permit a vote retry but changed decisions do not', () => {
  const old = initialPayload(demo);
  const id = demo.tracks[0].id;
  const command = { type: 'vote', trackId: id, verdict: 'keep' };
  const fresh = structuredClone(old);
  fresh.profile.brief = 'New musical feedback';
  fresh.tracks[id].notes = { agent: 'Updated context' };
  assert.equal(canRetryVote(command, old, fresh), true);
  fresh.votes[id] = {
    verdict: 'pass',
    at: '2026-11-01T00:00:00Z',
    note: '',
    tags: [],
  };
  assert.equal(canRetryVote(command, old, fresh), false);
});

void test('retry does not reinterpret another command or a changed recording', () => {
  const old = initialPayload(demo);
  const id = demo.tracks[0].id;
  assert.equal(canRetryVote({ type: 'undo', trackId: id }, old, old), false);
  const fresh = structuredClone(old);
  fresh.tracks[id].title = 'A different mix';
  assert.equal(canRetryVote({ type: 'vote', trackId: id }, old, fresh), false);
});
