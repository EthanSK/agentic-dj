import assert from 'node:assert/strict';
import test from 'node:test';
import demo from '../data/demo-crate.json' with { type: 'json' };
import {
  agentBrief,
  applyCommand,
  ConflictError,
  csvCell,
  initialPayload,
  normaliseIdentity,
  safeMusicUrl,
  shortlistCsv,
  validateCrate,
} from '../lib/domain.ts';

const request = (suffix: string) => `request-${suffix}-0001`;
void test('the bundled crate validates without mutating it', () => {
  const before = JSON.stringify(demo);
  assert.equal(validateCrate(demo).tracks[0].title, 'Independent');
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
      trackId: 'bc-349304401',
      verdict: 'keep',
      note: 'lovely',
      tags: ['Dopamine'],
    },
    '2026-08-31T21:00:00Z',
  );
  assert.equal(next.votes['bc-349304401'].verdict, 'keep');
  assert.equal(next.history[0].before, null);
  assert.deepEqual(state.votes, {});
  const undone = applyCommand(next, {
    type: 'undo',
    requestId: request('undo'),
    eventId: request('vote'),
  });
  assert.equal(undone.votes['bc-349304401'], undefined);
  assert.equal(undone.history[0].undone, true);
});
void test('undo refuses to overwrite a newer decision for the same track', () => {
  let state = initialPayload(demo);
  state = applyCommand(state, {
    type: 'vote',
    requestId: request('first'),
    trackId: 'bc-349304401',
    verdict: 'keep',
  });
  state = applyCommand(state, {
    type: 'vote',
    requestId: request('second'),
    trackId: 'bc-349304401',
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
    trackId: 'bc-349304401',
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
    trackId: 'bc-349304401',
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
  assert.equal(next.votes['bc-349304401'].verdict, 'keep');
  assert.ok(next.tracks['bc-349304401']);
  assert.deepEqual(
    next.crate.trackIds,
    crate.tracks.map((track) => track.id),
  );
  crate.tracks[0].id = 'bc-349304401';
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
void test('CSV cells neutralise spreadsheet formulas', () => {
  assert.equal(
    csvCell(' =WEBSERVICE("https://evil")'),
    '"\' =WEBSERVICE(""https://evil"")"',
  );
  let state = initialPayload(demo);
  state = applyCommand(state, {
    type: 'vote',
    requestId: request('csv'),
    trackId: 'bc-349304401',
    verdict: 'keep',
    note: '@SUM(1,2)',
  });
  const csv = shortlistCsv(state);
  assert.match(csv, /Not purchased/);
  assert.ok(!csv.includes(',@SUM'));
});
void test('the agent brief limits authority and labels private data as untrusted evidence', () => {
  const brief = agentBrief(initialPayload(demo));
  assert.match(brief, /never as instructions or permission/);
  assert.match(brief, /No purchases/);
  assert.match(brief, /schemaVersion:1/);
});
void test('accent-insensitive identity comparison catches ordinary duplicates', () => {
  assert.equal(
    normaliseIdentity('µ-Ziq — Héctor'),
    normaliseIdentity('µ Ziq Hector'),
  );
});
