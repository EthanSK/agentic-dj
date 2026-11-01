// Regression coverage for discovery surviving store refreshes, recovery and
// exports without changing listening decisions or the remaining queue.
import assert from 'node:assert/strict';
import test from 'node:test';
import demo from '../data/demo-crate.json' with { type: 'json' };
import {
  agentBrief,
  applyCommand,
  initialPayload,
  publicCrate,
  shortlistCsv,
  validateCrate,
} from '../lib/domain.ts';
import { discoveryLabel } from '../lib/discovery.ts';
import { allSessionsSummary } from '../lib/sessions.ts';

const discovery = { source: 'spotify-likes' as const };
const track = demo.tracks[0];
const record = {
  id: track.id,
  artist: track.artist,
  title: track.title,
  discovery,
};

void test('discovery describes the recommendation, never the playback provider', () => {
  assert.equal(discoveryLabel({}), 'Source not recorded');
  assert.equal(discoveryLabel({ discovery }), 'From your Spotify likes');
  assert.equal(
    discoveryLabel({ discovery: { source: 'agent', basedOn: 'past-likes' } }),
    'New pick from your Keeps',
  );
  assert.equal(
    discoveryLabel({ discovery: { source: 'rekordbox', basedOn: 'birthday' } }),
    'Inspired by your birthday favourites',
  );
  const imported = validateCrate({
    ...demo,
    tracks: [{ ...track, discovery }],
  });
  assert.equal(imported.tracks[0].preview?.provider, 'bandcamp');
  assert.deepEqual(imported.tracks[0].discovery, discovery);
  assert.throws(
    () =>
      validateCrate({
        ...demo,
        tracks: [{ ...track, discovery: { source: 'beatport' } }],
      }),
    /discovery/,
  );
  assert.throws(
    () =>
      validateCrate({
        ...demo,
        tracks: [
          { ...track, discovery: { source: 'agent', basedOn: 'invented' } },
        ],
      }),
    /discovery/,
  );
});

void test('source recovery preserves decisions, sessions, queue and all unrelated track data', () => {
  const initial = applyCommand(initialPayload(demo), {
    type: 'vote',
    trackId: track.id,
    verdict: 'keep',
    requestId: 'discovery-vote-001',
  });
  const before = structuredClone(initial);
  const next = applyCommand(initial, {
    type: 'record-discovery',
    tracks: [record],
    requestId: 'discovery-record-001',
  });
  assert.deepEqual(initial, before);
  assert.deepEqual(next.crate, before.crate);
  assert.deepEqual(next.votes, before.votes);
  assert.deepEqual(next.history, before.history);
  assert.deepEqual(next.sessions, before.sessions);
  assert.deepEqual(next.profile, before.profile);
  assert.deepEqual(next.tracks[track.id], {
    ...before.tracks[track.id],
    discovery,
  });
  const metadataRefresh = structuredClone(demo);
  for (const item of metadataRefresh.tracks)
    delete (item as Partial<typeof item>).discovery;
  const refreshed = applyCommand(next, {
    type: 'import',
    mode: 'append',
    crate: metadataRefresh,
    requestId: 'discovery-refresh-001',
  });
  assert.deepEqual(refreshed.tracks[track.id].discovery, discovery);
  assert.deepEqual(refreshed.votes, before.votes);
  assert.deepEqual(
    validateCrate(publicCrate(refreshed)).tracks[0].discovery,
    discovery,
  );
  assert.match(
    shortlistCsv(refreshed, allSessionsSummary(refreshed)),
    /Discovery source/,
  );
  assert.match(
    shortlistCsv(refreshed, allSessionsSummary(refreshed)),
    /From your Spotify likes/,
  );
  assert.match(agentBrief(refreshed), /"source": "spotify-likes"/);
  assert.match(agentBrief(refreshed), /Record discovery on every new track/);
});

void test('discovery recovery rejects a mixed bad batch atomically', () => {
  const initial = initialPayload(demo);
  const before = structuredClone(initial);
  for (const tracks of [
    [record, { ...record, id: demo.tracks[1].id, artist: 'Wrong artist' }],
    [record, record],
    [{ ...record, id: '__proto__' }],
  ]) {
    assert.throws(() =>
      applyCommand(initial, {
        type: 'record-discovery',
        tracks,
        requestId: 'discovery-reject-001',
      }),
    );
    assert.deepEqual(initial, before);
  }
});
