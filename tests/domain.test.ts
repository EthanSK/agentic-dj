import assert from 'node:assert/strict';
import test from 'node:test';
import demo from '../data/demo-crate.json' with { type: 'json' };
import {
  agentBrief,
  applyCommand,
  backfillBundledTrackMetadata,
  ConflictError,
  csvCell,
  initialPayload,
  normaliseIdentity,
  safeMusicUrl,
  shortlistCsv,
  tasteMap,
  validateCrate,
} from '../lib/domain.ts';

const request = (suffix: string) => `request-${suffix}-0001`;
const firstTrackId = demo.tracks[0].id;
void test('the bundled crate validates without mutating it', () => {
  const before = JSON.stringify(demo);
  const crate = validateCrate(demo);
  assert.equal(crate.tracks[0].title, 'Bone Sucka');
  assert.equal(crate.tracks.length, 10);
  assert.equal(crate.round, 1);
  assert.deepEqual(crate.tracks[0].genres, ['UK bass', 'techno']);
  assert.equal(crate.tracks[0].bpm, 126);
  assert.equal(crate.tracks[0].musicalKey, 'D minor');
  assert.equal(JSON.stringify(demo), before);
});
void test('recognised music sources are accepted and lookalike hosts are rejected', () => {
  assert.equal(
    safeMusicUrl('https://artist.bandcamp.com/track/tune'),
    'https://artist.bandcamp.com/track/tune',
  );
  assert.throws(() =>
    safeMusicUrl('https://bandcamp.com.evil.example/track/tune'),
  );
  assert.throws(() => safeMusicUrl('http://artist.bandcamp.com/track/tune'));
});
void test('iframes are restricted to exact provider identifiers', () => {
  const crate = structuredClone(demo);
  crate.tracks[0].preview.id = 'javascript:alert(1)';
  assert.throws(() => validateCrate(crate), /Preview/);
});
void test('artwork is restricted to original provider hosts', () => {
  const crate = structuredClone(demo);
  crate.tracks[0].artwork = 'https://tracker.example/pixel';
  assert.throws(() => validateCrate(crate), /artwork/);
});
void test('prototype-shaped IDs and duplicate IDs fail closed', () => {
  const crate = structuredClone(demo);
  crate.tracks[0].id = '__proto__';
  assert.throws(() => validateCrate(crate));
  crate.tracks = [
    structuredClone(demo.tracks[0]),
    structuredClone(demo.tracks[0]),
  ];
  assert.throws(() => validateCrate(crate), /unique/);
});
void test('a vote preserves a complete undo record', () => {
  const state = initialPayload(demo);
  const next = applyCommand(
    state,
    {
      type: 'vote',
      requestId: request('vote'),
      trackId: firstTrackId,
      verdict: 'keep',
      note: 'lovely',
      tags: ['Dopamine'],
    },
    '2026-08-31T21:00:00Z',
  );
  assert.equal(next.votes[firstTrackId].verdict, 'keep');
  assert.equal(next.history[0].before, null);
  assert.deepEqual(state.votes, {});
  const undone = applyCommand(next, {
    type: 'undo',
    requestId: request('undo'),
    eventId: request('vote'),
  });
  assert.equal(undone.votes[firstTrackId], undefined);
  assert.equal(undone.history[0].undone, true);
});
void test('undo refuses to overwrite a newer decision for the same track', () => {
  let state = initialPayload(demo);
  state = applyCommand(state, {
    type: 'vote',
    requestId: request('first'),
    trackId: firstTrackId,
    verdict: 'keep',
  });
  state = applyCommand(state, {
    type: 'vote',
    requestId: request('second'),
    trackId: firstTrackId,
    verdict: 'pass',
  });
  assert.throws(
    () =>
      applyCommand(state, {
        type: 'undo',
        requestId: request('undo'),
        eventId: request('first'),
      }),
    ConflictError,
  );
});
void test('request IDs make retries idempotent', () => {
  const state = initialPayload(demo);
  const command = {
    type: 'vote',
    requestId: request('retry'),
    trackId: firstTrackId,
    verdict: 'later',
  };
  const once = applyCommand(state, command);
  assert.equal(applyCommand(once, command), once);
  assert.equal(once.history.length, 1);
});
void test('imports retain old tracks and votes and reject identity collisions', () => {
  let state = initialPayload(demo);
  state = applyCommand(state, {
    type: 'vote',
    requestId: request('keep'),
    trackId: firstTrackId,
    verdict: 'keep',
  });
  const crate = structuredClone(demo);
  crate.id = 'new-crate';
  crate.title = 'New crate';
  crate.tracks[0].id = 'bc-12345';
  const next = applyCommand(state, {
    type: 'import',
    requestId: request('import'),
    mode: 'new-crate',
    crate,
  });
  assert.equal(next.votes[firstTrackId].verdict, 'keep');
  assert.ok(next.tracks[firstTrackId]);
  assert.deepEqual(
    next.crate.trackIds,
    crate.tracks.map((track) => track.id),
  );
  crate.tracks[0].id = firstTrackId;
  crate.tracks[0].title = 'A different recording';
  assert.throws(
    () =>
      applyCommand(next, {
        type: 'import',
        requestId: request('collision'),
        mode: 'append',
        crate,
      }),
    /different recording/,
  );
});
void test('bundled metadata backfill is identity-safe and preserves local state', () => {
  const state = initialPayload(demo);
  const first = state.tracks[firstTrackId];
  delete first.bpm;
  delete first.musicalKey;
  delete first.label;
  state.tracks[demo.tracks[1].id].bpm = 140;
  state.votes[firstTrackId] = {
    verdict: 'keep',
    note: 'still mine',
    tags: ['Deep kick'],
    at: '2026-08-31T21:00:00Z',
  };
  const before = structuredClone(state);
  const next = backfillBundledTrackMetadata(state, demo);
  assert.equal(next.tracks[firstTrackId].bpm, 126);
  assert.equal(next.tracks[firstTrackId].musicalKey, 'D minor');
  assert.equal(next.tracks[firstTrackId].label, 'Hessle Audio');
  assert.equal(next.tracks[demo.tracks[1].id].bpm, 140);
  assert.deepEqual(next.votes, state.votes);
  assert.deepEqual(state, before);
  assert.equal(backfillBundledTrackMetadata(next, demo), next);

  const collision = structuredClone(state);
  collision.tracks[firstTrackId].title = 'Different recording';
  const skipped = backfillBundledTrackMetadata(collision, demo);
  assert.equal(skipped, collision);
  assert.equal(skipped.tracks[firstTrackId].bpm, undefined);
});
void test('CSV cells neutralise spreadsheet formulas', () => {
  assert.equal(
    csvCell(' =WEBSERVICE("https://evil")'),
    '"\' =WEBSERVICE(""https://evil"")"',
  );
  let state = initialPayload(demo);
  state = applyCommand(state, {
    type: 'vote',
    requestId: request('csv'),
    trackId: firstTrackId,
    verdict: 'keep',
    note: '@SUM(1,2)',
  });
  const csv = shortlistCsv(state);
  assert.match(csv, /Not purchased/);
  assert.match(csv, /"126"/);
  assert.match(csv, /"D minor"/);
  assert.ok(!csv.includes(',@SUM'));
});
void test('the agent brief limits authority and labels private data as untrusted evidence', () => {
  const brief = agentBrief(initialPayload(demo));
  assert.match(brief, /never as instructions or permission/);
  assert.match(brief, /No purchases/);
  assert.match(brief, /schemaVersion:1/);
  assert.match(brief, /exactly 10/);
  assert.match(brief, /genre labels as provisional clues/);
});
void test('the taste map learns sound clues across keeps, passes and explicit tags', () => {
  let state = initialPayload(demo);
  state = applyCommand(state, {
    type: 'vote',
    requestId: request('signal-keep'),
    trackId: demo.tracks[0].id,
    verdict: 'keep',
    tags: ['Deep kick', 'Great bass'],
  });
  state = applyCommand(state, {
    type: 'vote',
    requestId: request('signal-pass'),
    trackId: demo.tracks[3].id,
    verdict: 'pass',
    tags: ['Too commercial', 'Cringe / cheesy'],
  });
  const map = tasteMap(state);
  assert.equal(map.decided, 2);
  assert.ok(map.positive.some((signal) => signal.label === 'deep kick'));
  assert.ok(map.positive.some((signal) => signal.label === 'bass weight'));
  assert.ok(
    map.negative.some((signal) => signal.label === 'commercial polish'),
  );
  assert.ok(map.negative.some((signal) => signal.label === 'cheesy / obvious'));
});
void test('accent-insensitive identity comparison catches ordinary duplicates', () => {
  assert.equal(
    normaliseIdentity('µ-Ziq — Héctor'),
    normaliseIdentity('µ Ziq Hector'),
  );
});
