// Listening-session behaviour: legacy inference, the 14-day rule, Up next,
// manual sessions, scoped exports and the revision/idempotency contract.
// Run with `npm test`; fixtures derive from the public demo crate only.
import assert from 'node:assert/strict';
import test from 'node:test';
import demo from '../data/demo-crate.json' with { type: 'json' };
import {
  agentBrief,
  applyCommand,
  asState,
  ConflictError,
  initialPayload,
  InputError,
  keptTracks,
  planMutation,
  shortlistCsv,
  tasteMap,
} from '../lib/domain.ts';
import {
  allSessionsSummary,
  listSessionSummaries,
  nextRoundNumber,
  normaliseSessionState,
  scopeSummary,
  SessionDataError,
  SESSION_GAP_MS,
} from '../lib/sessions.ts';
import type { Payload, StoredPayload } from '../lib/types.ts';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-08-31T21:00:00.000Z');
const at = (offset: number) => new Date(T0 + offset).toISOString();
let requestCounter = 0;
const request = () =>
  `session-test-${String(++requestCounter).padStart(4, '0')}`;

/** A three-track round built from distinct demo recordings. */
function round(id: string, number: number | undefined, first: number) {
  return {
    ...demo,
    id,
    title: `Round ${number ?? id}`,
    description: `Description of ${id}`,
    round: number,
    tracks: demo.tracks.slice(first, first + 3).map((track, index) => ({
      ...track,
      id: `${id}-t${index}`,
    })),
  };
}
function vote(
  state: Payload,
  trackId: string,
  verdict: 'keep' | 'pass' | 'later',
  when: number,
  extra: Record<string, unknown> = {},
) {
  return applyCommand(
    state,
    { type: 'vote', requestId: request(), trackId, verdict, ...extra },
    at(when),
  );
}
function command(state: Payload, body: Record<string, unknown>, when: number) {
  return applyCommand(state, { requestId: request(), ...body }, at(when));
}
/** Strip everything sessions added, as a library saved before them looks. */
function asLegacy(state: Payload): StoredPayload {
  const legacy: StoredPayload = structuredClone(state);
  delete legacy.sessions;
  delete legacy.queuedRounds;
  for (const saved of Object.values(legacy.votes)) delete saved.sessionId;
  for (const event of legacy.history) {
    delete event.after.sessionId;
    if (event.before) delete event.before.sessionId;
  }
  return legacy;
}

const r1 = round('round-one', 1, 0);
const r2 = round('round-two', 2, 3);
const r3 = round('round-three', 3, 6);
const r4 = round('round-four', 4, 0);
const r5 = round('round-five', 5, 3);

/** Aug: round 1. Sep (17 days later): rounds 2–3, round 4 prepared but unheard. Oct: round 5. */
function legacyLibrary(): StoredPayload {
  let state = initialPayload(r1);
  state = vote(state, 'round-one-t0', 'keep', 0);
  state = vote(state, 'round-one-t1', 'pass', 1000);
  state = command(
    state,
    { type: 'import', mode: 'new-crate', crate: r2 },
    17 * DAY,
  );
  state = vote(state, 'round-two-t0', 'keep', 17 * DAY + 1000);
  state = command(
    state,
    { type: 'import', mode: 'new-crate', crate: r3 },
    18 * DAY,
  );
  state = vote(state, 'round-three-t0', 'later', 18 * DAY + 1000);
  state = vote(state, 'round-three-t1', 'keep', 19 * DAY);
  state = command(
    state,
    { type: 'import', mode: 'new-crate', crate: r4 },
    20 * DAY,
  );
  state = command(
    state,
    { type: 'import', mode: 'new-crate', crate: r5 },
    58 * DAY,
  );
  state = vote(state, 'round-five-t0', 'keep', 59 * DAY);
  return asLegacy(state);
}

void test('a legacy library gets sessions from its decision dates without changing anything saved', () => {
  const legacy = legacyLibrary();
  const before = structuredClone(legacy);
  const state = normaliseSessionState(legacy);

  assert.deepEqual(
    legacy,
    before,
    'reading must not mutate the stored payload',
  );
  assert.deepEqual(state.votes, legacy.votes);
  assert.deepEqual(state.history, legacy.history);
  assert.deepEqual(state.tracks, legacy.tracks);
  assert.deepEqual(state.profile, legacy.profile);
  assert.deepEqual(state.crate, legacy.crate);
  assert.deepEqual(state.queuedRounds, []);
  assert.deepEqual(
    normaliseSessionState(structuredClone(legacy)).sessions,
    state.sessions,
  );

  assert.deepEqual(
    state.sessions.map((s) => [s.id, s.start, s.roundIds]),
    [
      ['session-1', 'inferred', ['round-one']],
      // Round 4 has no decisions, so it sits beside round 3 by number.
      ['session-2', 'inferred', ['round-two', 'round-three', 'round-four']],
      ['session-3', 'inferred', ['round-five']],
    ],
  );
  assert.equal(state.sessions[0].startedAt, at(0));
  assert.equal(state.sessions[1].lastActivityAt, at(19 * DAY));
  assert.match(state.sessions[1].note ?? '', /Round 4 had no decisions/);
  assert.equal(state.sessions[2].note, undefined);

  const [current, second, first] = listSessionSummaries(state, T0 + 60 * DAY);
  assert.deepEqual(
    [current.status, current.keptIds],
    ['current', ['round-five-t0']],
  );
  assert.deepEqual(second.keptIds, ['round-two-t0', 'round-three-t1']);
  assert.deepEqual(first.keptIds, ['round-one-t0']);
  assert.equal(second.trackIds.length, 9);
  assert.equal(second.decided, 3);
  // Global Keeps and taste evidence still cover every session.
  assert.deepEqual(
    allSessionsSummary(state).keptIds,
    keptTracks(state).map((track) => track.id),
  );
  assert.equal(tasteMap(state).decided, Object.keys(state.votes).length);

  // The next ordinary mutation persists the same sessions, extended in place.
  const next = vote(state, 'round-five-t1', 'pass', 60 * DAY);
  assert.equal(next.sessions.length, 3);
  assert.equal(next.sessions[2].lastActivityAt, at(60 * DAY));
  assert.deepEqual(next.sessions.slice(0, 2), state.sessions.slice(0, 2));
  assert.equal(next.votes['round-five-t1'].sessionId, 'session-3');
  for (const [trackId, saved] of Object.entries(state.votes))
    assert.deepEqual(next.votes[trackId], saved);
});

void test('saved sessions are kept as saved and damaged session data fails closed', () => {
  const state = normaliseSessionState(legacyLibrary());
  const saved = structuredClone(state) as StoredPayload & {
    sessions: (Payload['sessions'][number] & { futureField?: string })[];
  };
  // A manual split that inference would never produce, plus a newer field.
  saved.sessions[2] = {
    ...saved.sessions[2],
    start: 'manual',
    roundIds: ['round-five', 'round-four'],
    futureField: 'kept',
  };
  const read = normaliseSessionState(structuredClone(saved));
  assert.deepEqual(read.sessions, saved.sessions);

  const damage: [string, (copy: StoredPayload) => void][] = [
    ['not a list', (copy) => ((copy as Record<string, unknown>).sessions = {})],
    ['duplicate id', (copy) => (copy.sessions![1].id = 'session-1')],
    ['numbers out of order', (copy) => (copy.sessions![2].number = 1)],
    ['bad date', (copy) => (copy.sessions![0].startedAt = 'yesterday')],
    ['dates out of order', (copy) => (copy.sessions![2].startedAt = at(-DAY))],
    [
      'unknown start',
      (copy) => ((copy.sessions![0] as { start: string }).start = 'guess'),
    ],
    [
      'queued round with a missing track',
      (copy) =>
        (copy.queuedRounds = [
          {
            ...copy.crate,
            id: 'ghost',
            trackIds: ['not-saved'],
            queuedAt: at(0),
          },
        ]),
    ],
  ];
  for (const [name, corrupt] of damage) {
    const copy = structuredClone(saved);
    corrupt(copy);
    const snapshot = structuredClone(copy);
    assert.throws(() => normaliseSessionState(copy), SessionDataError, name);
    assert.deepEqual(copy, snapshot, `${name}: input left untouched`);
  }
});

void test('only a decision after more than 14 days away starts a new session', () => {
  let state = initialPayload(r1);
  assert.deepEqual(state.sessions, []);
  assert.equal(listSessionSummaries(state, T0)[0].status, 'next');

  state = vote(state, 'round-one-t0', 'keep', 0);
  assert.deepEqual(
    state.sessions.map((s) => [s.id, s.start, s.lastActivityAt]),
    [['session-1', 'automatic', at(0)]],
  );
  // Exactly 14 days later still continues the same session.
  state = vote(state, 'round-one-t1', 'later', SESSION_GAP_MS);
  assert.equal(state.sessions.length, 1);
  assert.equal(state.votes['round-one-t1'].sessionId, 'session-1');

  // Away for longer: reads show the next session but create nothing.
  const away = SESSION_GAP_MS * 2 + 1;
  const sessionsBefore = structuredClone(state.sessions);
  const [pending, stale] = listSessionSummaries(state, T0 + away);
  assert.deepEqual(
    [pending.id, pending.status, pending.keptIds],
    ['session-2', 'next', []],
  );
  assert.equal(stale.status, 'past');
  assert.deepEqual(stale.keptIds, ['round-one-t0']);

  // Agent imports and profile edits are not listening activity.
  state = command(state, { type: 'import', mode: 'queue', crate: r2 }, away);
  state = command(state, { type: 'import', mode: 'append', crate: r3 }, away);
  state = command(
    state,
    { type: 'profile', profile: { brief: 'deep kick', avoid: '', seeds: '' } },
    away,
  );
  assert.deepEqual(state.sessions, sessionsBefore);
  // The prepared round already counts as a candidate for the coming session.
  assert.ok(
    listSessionSummaries(state, T0 + away)[0].trackIds.includes('round-two-t0'),
  );

  state = vote(state, 'round-one-t2', 'keep', away);
  assert.deepEqual(
    state.sessions.map((s) => [s.id, s.start, s.startedAt]),
    [
      ['session-1', 'automatic', at(0)],
      ['session-2', 'automatic', at(away)],
    ],
  );
  const [current, past] = listSessionSummaries(state, T0 + away);
  assert.deepEqual([current.id, current.status], ['session-2', 'current']);
  assert.deepEqual(current.keptIds, ['round-one-t2']);
  assert.deepEqual(past.keptIds, ['round-one-t0']);
  assert.ok(current.trackIds.includes('round-two-t0'));
});

void test('Up next waits for an explicit open and never drops an unfinished round', () => {
  let state = initialPayload(r1);
  state = vote(state, 'round-one-t0', 'keep', 0);
  const decisions = structuredClone(state.votes);

  state = command(state, { type: 'import', mode: 'queue', crate: r2 }, DAY);
  assert.equal(state.crate.id, 'round-one', 'queueing keeps the active round');
  assert.deepEqual(
    state.queuedRounds.map((q) => q.id),
    ['round-two'],
  );
  assert.deepEqual(state.votes, decisions);
  assert.deepEqual(
    state.tracks['round-two-t0'].rounds?.map((r) => r.crateId),
    ['round-two'],
  );

  const unchanged = structuredClone(state);
  assert.throws(
    () => command(state, { type: 'import', mode: 'queue', crate: r1 }, DAY),
    InputError,
  );
  assert.throws(
    () => command(state, { type: 'open-round', crateId: 'round-nine' }, DAY),
    InputError,
  );
  assert.deepEqual(state, unchanged, 'invalid commands change nothing');

  state = command(state, { type: 'open-round', crateId: 'round-two' }, DAY);
  assert.equal(state.crate.id, 'round-two');
  assert.equal(state.crate.description, 'Description of round-two');
  // Round 1 still has two unheard tracks, so it waits in Up next.
  assert.deepEqual(
    state.queuedRounds.map((q) => [q.id, q.description, q.trackIds.length]),
    [['round-one', 'Description of round-one', 3]],
  );
  assert.deepEqual(state.sessions[0].roundIds, ['round-one', 'round-two']);
  assert.equal(state.sessions.length, 1);

  state = command(state, { type: 'open-round', crateId: 'round-one' }, DAY);
  assert.equal(state.crate.id, 'round-one');
  assert.deepEqual(
    state.queuedRounds.map((q) => q.id),
    ['round-two'],
  );

  // Finish round 1; replacing a finished round leaves nothing to reopen.
  state = vote(state, 'round-one-t1', 'pass', DAY);
  state = vote(state, 'round-one-t2', 'pass', DAY);
  state = command(state, { type: 'import', mode: 'new-crate', crate: r3 }, DAY);
  assert.deepEqual(
    state.queuedRounds.map((q) => q.id),
    ['round-two'],
  );
  // Replacing an unfinished round through new-crate sets it aside too.
  state = command(state, { type: 'import', mode: 'new-crate', crate: r2 }, DAY);
  assert.equal(state.crate.id, 'round-two');
  assert.deepEqual(
    state.queuedRounds.map((q) => q.id),
    ['round-three'],
  );
  assert.equal(nextRoundNumber(state), 4);
});

void test('a manual new session keeps every decision and moves Keeps without duplicating them', () => {
  let state = initialPayload(r1);
  state = vote(state, 'round-one-t0', 'keep', 0, { note: 'first listen' });
  const firstDecision = structuredClone(state.votes['round-one-t0']);
  const history = structuredClone(state.history);

  const newSession = { type: 'new-session', requestId: request() };
  const started = applyCommand(state, newSession, at(DAY));
  assert.equal(
    applyCommand(started, newSession, at(DAY)),
    started,
    'retry is idempotent',
  );
  state = started;
  assert.deepEqual(
    state.sessions.map((s) => [s.id, s.start, s.lastActivityAt]),
    [
      ['session-1', 'automatic', at(0)],
      ['session-2', 'manual', null],
    ],
  );
  assert.deepEqual(state.votes['round-one-t0'], firstDecision);
  assert.deepEqual(state.history, history);
  assert.equal(state.crate.id, 'round-one');

  assert.throws(
    () => command(state, { type: 'new-session' }, DAY + 1),
    /Session 2 has no decisions yet/,
  );

  let [current, past] = listSessionSummaries(state, T0 + DAY);
  assert.deepEqual([current.keptIds, past.keptIds], [[], ['round-one-t0']]);
  // An empty manual session never goes stale, so it is not replaced later.
  assert.equal(listSessionSummaries(state, T0 + 90 * DAY)[0].id, 'session-2');

  // Re-deciding an old Keep now makes it a current-session Keep, once.
  state = vote(state, 'round-one-t0', 'keep', 2 * DAY, { note: 'still great' });
  [current, past] = listSessionSummaries(state, T0 + 2 * DAY);
  assert.deepEqual([current.keptIds, past.keptIds], [['round-one-t0'], []]);
  assert.equal(allSessionsSummary(state).keptIds.length, 1);

  // Undo restores the old decision in its original session.
  const lastEvent = state.history.at(-1);
  assert.ok(lastEvent);
  state = command(state, { type: 'undo', eventId: lastEvent.id }, 2 * DAY + 1);
  assert.deepEqual(state.votes['round-one-t0'], firstDecision);
  [current, past] = listSessionSummaries(state, T0 + 2 * DAY);
  assert.deepEqual([current.keptIds, past.keptIds], [[], ['round-one-t0']]);
  assert.equal(state.sessions.length, 2);
});

void test('session commands use the revision check and request idempotency', () => {
  let payload = initialPayload(r1);
  payload = vote(payload, 'round-one-t0', 'keep', 0);
  const tabs = asState(payload, 7, at(0));

  assert.throws(
    () => planMutation(tabs, { type: 'new-session', requestId: request() }),
    /Include the revision/,
  );
  assert.throws(
    () =>
      planMutation(tabs, {
        type: 'new-session',
        requestId: request(),
        expectedRevision: 6,
      }),
    ConflictError,
  );
  const commandBody = {
    type: 'new-session',
    requestId: request(),
    expectedRevision: 7,
  };
  const next = planMutation(tabs, commandBody, at(DAY));
  assert.ok(next);
  assert.equal(next.sessions.length, 2);
  const saved = asState(next, 8, at(DAY));
  assert.equal(planMutation(saved, commandBody), null, 'retry writes nothing');
  // The other tab still holds revision 7 and must reload before voting.
  assert.throws(
    () =>
      planMutation(saved, {
        type: 'vote',
        trackId: 'round-one-t1',
        verdict: 'keep',
        requestId: request(),
        expectedRevision: 7,
      }),
    ConflictError,
  );
});

void test('exports and the brief name their scope: this session for buying, all sessions for taste', () => {
  let state = initialPayload(r1);
  state = vote(state, 'round-one-t0', 'keep', 0);
  state = command(state, { type: 'import', mode: 'queue', crate: r4 }, DAY);
  state = vote(state, 'round-one-t1', 'keep', 30 * DAY);
  const now = T0 + 30 * DAY;
  const oldArtist = state.tracks['round-one-t0'].artist;
  const newArtist = state.tracks['round-one-t1'].artist;
  assert.notEqual(oldArtist, newArtist);

  const current = scopeSummary(state, 'current', now);
  assert.ok(current);
  const sessionCsv = shortlistCsv(state, current);
  assert.match(sessionCsv, new RegExp(newArtist));
  assert.doesNotMatch(sessionCsv, new RegExp(oldArtist));
  assert.match(sessionCsv, /"Session 2"/);
  assert.equal(sessionCsv.split('\r\n').length, 2);

  const all = scopeSummary(state, 'all', now);
  assert.ok(all);
  assert.equal(shortlistCsv(state, all).split('\r\n').length, 3);
  assert.deepEqual(scopeSummary(state, 'session-1', now)?.keptIds, [
    'round-one-t0',
  ]);
  assert.equal(scopeSummary(state, 'session-9', now), undefined);
  // An unsaved upcoming session is not addressable by ID.
  assert.equal(scopeSummary(state, 'session-3', now + 30 * DAY), undefined);

  const brief = agentBrief(state, now);
  const data = JSON.parse(brief.slice(brief.indexOf('{')));
  assert.equal(data.decisionScope, 'all sessions');
  assert.equal(data.decisions.length, 2);
  assert.equal(data.currentSession.label, 'Session 2');
  assert.deepEqual(
    data.currentSession.keeps.map((k: { id: string }) => k.id),
    ['round-one-t1'],
  );
  assert.deepEqual(
    data.upNext.map((r: { id: string }) => r.id),
    ['round-four'],
  );
  assert.match(brief, /mode `append`/);
  assert.match(brief, /# Agentic DJ — request round 5/);
});

void test('automatic rollover cannot persist more sessions than the saved-state limit', () => {
  const state = initialPayload(r1);
  state.sessions = Array.from({ length: 1000 }, (_, i) => ({
    id: `session-${i + 1}`,
    number: i + 1,
    startedAt: at(i * DAY),
    lastActivityAt: at(i * DAY),
    start: 'automatic' as const,
    roundIds: [r1.id],
  }));
  const before = structuredClone(state);
  assert.throws(
    () => vote(state, r1.tracks[0].id, 'keep', 1020 * DAY),
    /too many sessions/,
  );
  assert.deepEqual(state, before);
});
