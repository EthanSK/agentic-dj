// Listening sessions: the buying-shortlist scope above rounds.
//
// Ethan asked (1 Nov 2026) to see "how much I've kept from the current set",
// to start a new session "if it's been more than like a couple weeks since the
// last session of looking for tracks", and to have a clear header plus a Past
// sessions button. One session spans several rounds and produces one buying
// shortlist. Taste evidence (Earprint, agent brief decisions) still uses every
// saved decision; only shopping counts and exports are session-scoped.
//
// Callers: `lib/domain.ts` (commands, CSV, brief), `db/store.ts` (read
// normalisation) and `components/listening-desk.tsx` (header, Past sessions
// panel and queue rail). Everything here is pure; nothing touches storage.

import { isSafeId } from './ids.ts';
import { isAuditionReady } from './preview-source.ts';
import type {
  ListeningSession,
  Payload,
  QueuedRound,
  RoundRef,
  SessionStart,
  StoredPayload,
  Vote,
} from './types.ts';

export const SESSION_GAP_DAYS = 14;
/**
 * More than this much time without a genuine decision starts a new session
 * at the next decision. Exactly 14 days still continues the old session.
 */
export const SESSION_GAP_MS = SESSION_GAP_DAYS * 24 * 60 * 60 * 1000;
export const MAX_SESSIONS = 1000;
export const MAX_QUEUED_ROUNDS = 50;
const MAX_ROUNDS_PER_SESSION = 1000;
const MAX_QUEUED_TRACKS = 500;

/** Saved session data failed validation. Reads fail closed; nothing is written. */
export class SessionDataError extends Error {}

export function sessionLabel(number: number): string {
  return `Session ${number}`;
}

// ---------------------------------------------------------------------------
// Rounds known to the library
// ---------------------------------------------------------------------------

interface RoundEntry {
  ref: RoundRef;
  trackIds: string[];
}

function roundRef(crateId: string, title: string, round?: number): RoundRef {
  return { crateId, title, ...(round != null ? { round } : {}) };
}

/**
 * Every crate the library knows about, with its member tracks. Track
 * memberships are the durable provenance; the active and queued headers add
 * their authoritative order (and cover tracks saved before memberships existed).
 */
function catalogueRounds(
  state: Pick<StoredPayload, 'crate' | 'tracks' | 'queuedRounds'>,
): Map<string, RoundEntry> {
  const rounds = new Map<string, RoundEntry>();
  const ensure = (ref: RoundRef): RoundEntry => {
    let entry = rounds.get(ref.crateId);
    if (!entry) {
      entry = {
        ref: roundRef(ref.crateId, ref.title, ref.round),
        trackIds: [],
      };
      rounds.set(ref.crateId, entry);
    }
    return entry;
  };
  for (const [trackId, track] of Object.entries(state.tracks))
    for (const ref of track.rounds ?? []) ensure(ref).trackIds.push(trackId);
  for (const header of [state.crate, ...(state.queuedRounds ?? [])]) {
    const entry = ensure(roundRef(header.id, header.title, header.round));
    entry.ref = roundRef(header.id, header.title, header.round);
    entry.trackIds = [...new Set([...header.trackIds, ...entry.trackIds])];
  }
  for (const entry of rounds.values())
    entry.trackIds = entry.trackIds.filter((id) => state.tracks[id]);
  return rounds;
}

/** The next round number an agent should use, across active, queued and past rounds. */
export function nextRoundNumber(state: StoredPayload): number {
  let highest = 0;
  for (const { ref } of catalogueRounds(state).values())
    if (ref.round != null) highest = Math.max(highest, ref.round);
  return Math.max(highest, state.crate.round ?? 1) + 1;
}

// ---------------------------------------------------------------------------
// Legacy inference
// ---------------------------------------------------------------------------

type Activity = { at: number; iso: string; trackId: string };

function savedActivity(state: StoredPayload): Activity[] {
  const activity: Activity[] = [];
  const add = (iso: string, trackId: string) => {
    const at = Date.parse(iso);
    if (Number.isFinite(at)) activity.push({ at, iso, trackId });
  };
  for (const event of state.history) add(event.at, event.trackId);
  // Votes normally repeat a history event, but history keeps only the latest
  // 2000 events, so current decisions are read directly as well.
  for (const [trackId, vote] of Object.entries(state.votes))
    add(vote.at, trackId);
  return activity.sort(
    (a, b) =>
      a.at - b.at ||
      a.iso.localeCompare(b.iso) ||
      a.trackId.localeCompare(b.trackId),
  );
}

type NumberedRound = RoundRef & { round: number };
const isNumbered = (ref: RoundRef): ref is NumberedRound => ref.round != null;

function describeRounds(numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  if (sorted.length === 1) return `Round ${sorted[0]}`;
  return `Rounds ${sorted.slice(0, -1).join(', ')} and ${sorted.at(-1)}`;
}

/**
 * Rebuild sessions for a library saved before sessions existed.
 *
 * Saved history and decision times are the only dated evidence, so sessions
 * split wherever more than 14 days pass between decisions — the same rule as
 * live rollover. Each round joins the session of its first decision; the
 * active round also continues into the latest session. A round with no
 * decisions has no date: a numbered one is placed beside its nearest heard
 * round number (lower first), and anything else joins the latest session.
 * That placement is recorded in the session note rather than presented as
 * fact. Purchases are not inferred: a past session's Keeps are not marked as
 * bought here, because purchase receipts live outside the app.
 *
 * Deterministic and read-only, so repeated reads before the first save show
 * exactly what that save will persist.
 */
export function inferLegacySessions(state: StoredPayload): ListeningSession[] {
  const activity = savedActivity(state);
  if (!activity.length) return [];

  const groups: { first: Activity; last: Activity }[] = [];
  for (const event of activity) {
    const group = groups.at(-1);
    if (!group || event.at - group.last.at > SESSION_GAP_MS)
      groups.push({ first: event, last: event });
    else group.last = event;
  }
  const groupAt = (at: number): number => {
    let index = 0;
    groups.forEach((group, candidate) => {
      if (group.first.at <= at) index = candidate;
    });
    return index;
  };

  const rounds = catalogueRounds(state);
  const roundsByTrack = new Map<string, string[]>();
  for (const [crateId, entry] of rounds)
    for (const trackId of entry.trackIds)
      roundsByTrack.set(trackId, [
        ...(roundsByTrack.get(trackId) ?? []),
        crateId,
      ]);

  const firstHeard = new Map<string, number>();
  for (const event of activity)
    for (const crateId of roundsByTrack.get(event.trackId) ?? [])
      if (!firstHeard.has(crateId)) firstHeard.set(crateId, event.at);

  const latest = groups.length - 1;
  const roundIds = groups.map(() => [] as string[]);
  const heardIn = new Map<string, number>();
  for (const [crateId, at] of [...firstHeard].sort((a, b) => a[1] - b[1])) {
    heardIn.set(crateId, groupAt(at));
    roundIds[groupAt(at)].push(crateId);
  }

  const heardNumbered = [...rounds.values()]
    .map((entry) => entry.ref)
    .filter((ref) => heardIn.has(ref.crateId))
    .filter(isNumbered);
  const placedByNumber = groups.map(() => [] as number[]);
  const placedLatest: string[] = [];
  const unheard = [...rounds.values()]
    .map((entry) => entry.ref)
    .filter(
      (ref) => !firstHeard.has(ref.crateId) && ref.crateId !== state.crate.id,
    )
    .sort((a, b) => (a.round ?? Infinity) - (b.round ?? Infinity));
  for (const ref of unheard) {
    let index = latest;
    if (isNumbered(ref)) {
      const lower = heardNumbered
        .filter((other) => other.round < ref.round)
        .sort((a, b) => b.round - a.round)[0];
      const higher = heardNumbered
        .filter((other) => other.round > ref.round)
        .sort((a, b) => a.round - b.round)[0];
      const neighbour = lower ?? higher;
      if (neighbour) {
        index = heardIn.get(neighbour.crateId) ?? latest;
        placedByNumber[index].push(ref.round);
      } else placedLatest.push(ref.title);
    } else placedLatest.push(ref.title);
    roundIds[index].push(ref.crateId);
  }
  // The active round is what the listener is on now, so it always belongs to
  // the latest session, even when it began in an earlier one.
  if (!roundIds[latest].includes(state.crate.id))
    roundIds[latest].push(state.crate.id);

  return groups.map((group, index) => {
    const notes: string[] = [];
    if (placedByNumber[index].length)
      notes.push(
        `${describeRounds(placedByNumber[index])} had no decisions, so ${placedByNumber[index].length === 1 ? 'it is' : 'they are'} placed by round number.`,
      );
    if (index === latest && placedLatest.length)
      notes.push(
        `${placedLatest.join(', ')} had no decisions or round number, so ${placedLatest.length === 1 ? 'it is' : 'they are'} placed in the latest session.`,
      );
    return {
      id: `session-${index + 1}`,
      number: index + 1,
      startedAt: group.first.iso,
      lastActivityAt: group.last.iso,
      start: 'inferred' as const,
      roundIds: roundIds[index],
      ...(notes.length ? { note: notes.join(' ') } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Validation of saved sessions and queued rounds
// ---------------------------------------------------------------------------

const SESSION_STARTS = new Set<SessionStart>([
  'inferred',
  'automatic',
  'manual',
]);

function damaged(detail: string): never {
  throw new SessionDataError(
    `Saved session data is damaged (${detail}). Nothing was changed. Restore a private backup or a compatible app version.`,
  );
}
function record(value: unknown, detail: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    damaged(detail);
  return value as Record<string, unknown>;
}
function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/**
 * Validate saved sessions without rewriting them. Unknown extra fields are
 * deliberately kept (the objects are returned as stored) so a newer app's
 * additions survive a save by this version.
 */
export function validateStoredSessions(value: unknown): ListeningSession[] {
  if (!Array.isArray(value) || value.length > MAX_SESSIONS)
    damaged('sessions must be a bounded list');
  const ids = new Set<string>();
  let previous: { number: number; startedAt: number } | undefined;
  for (const raw of value) {
    const session = record(raw, 'session entry');
    if (!isSafeId(session.id) || ids.has(session.id))
      damaged('session IDs must be unique');
    ids.add(session.id);
    if (
      !Number.isSafeInteger(session.number) ||
      Number(session.number) < 1 ||
      (previous && Number(session.number) <= previous.number)
    )
      damaged('session numbers must increase');
    if (!validDate(session.startedAt)) damaged('session start date');
    const startedAt = Date.parse(session.startedAt);
    // Undated legacy decisions are attributed by these start dates.
    if (previous && startedAt < previous.startedAt)
      damaged('sessions must be in date order');
    if (session.lastActivityAt !== null && !validDate(session.lastActivityAt))
      damaged('session activity date');
    if (!SESSION_STARTS.has(session.start as SessionStart))
      damaged('session start kind');
    if (
      !Array.isArray(session.roundIds) ||
      session.roundIds.length > MAX_ROUNDS_PER_SESSION ||
      !session.roundIds.every(isSafeId)
    )
      damaged('session rounds');
    if (
      session.note !== undefined &&
      (typeof session.note !== 'string' || session.note.length > 2000)
    )
      damaged('session note');
    previous = { number: Number(session.number), startedAt };
  }
  // Every field read by the app was checked above.
  return value as ListeningSession[];
}

export function validateStoredQueue(
  value: unknown,
  tracks: StoredPayload['tracks'],
): QueuedRound[] {
  if (!Array.isArray(value) || value.length > MAX_QUEUED_ROUNDS)
    damaged('Up next must be a bounded list');
  const ids = new Set<string>();
  for (const raw of value) {
    const round = record(raw, 'queued round');
    if (round.schemaVersion !== 1) damaged('queued round version');
    if (!isSafeId(round.id) || ids.has(round.id))
      damaged('queued round IDs must be unique');
    ids.add(round.id);
    if (typeof round.title !== 'string' || !round.title.trim())
      damaged('queued round title');
    if (typeof round.description !== 'string')
      damaged('queued round description');
    if (
      round.round !== undefined &&
      (!Number.isSafeInteger(round.round) || Number(round.round) < 1)
    )
      damaged('queued round number');
    if (
      !Array.isArray(round.trackIds) ||
      !round.trackIds.length ||
      round.trackIds.length > MAX_QUEUED_TRACKS ||
      !round.trackIds.every((id) => isSafeId(id) && Object.hasOwn(tracks, id))
    )
      damaged('queued round tracks must be saved tracks');
    if (!validDate(round.queuedAt)) damaged('queued round date');
  }
  return value as QueuedRound[];
}

/**
 * Read-time normalisation for every saved payload. Legacy libraries get
 * inferred sessions and an empty Up next list in memory only; saved sessions
 * are validated, never re-inferred, so manual sessions and live rollover
 * decisions are not replaced by a later guess.
 */
export function normaliseSessionState(stored: StoredPayload): Payload {
  const queuedRounds =
    stored.queuedRounds === undefined
      ? []
      : validateStoredQueue(stored.queuedRounds, stored.tracks);
  const sessions =
    stored.sessions === undefined
      ? inferLegacySessions(stored)
      : validateStoredSessions(stored.sessions);
  return { ...stored, sessions, queuedRounds };
}

// ---------------------------------------------------------------------------
// Live sessions
// ---------------------------------------------------------------------------

/**
 * A session is stale after more than 14 days without a decision. A manual
 * session with no decisions yet is never stale: it was started on purpose,
 * and replacing it would only leave an empty session behind.
 */
export function isSessionStale(
  session: ListeningSession,
  now: number,
): boolean {
  return (
    session.lastActivityAt !== null &&
    now - Date.parse(session.lastActivityAt) > SESSION_GAP_MS
  );
}

function newSession(
  state: Payload,
  at: string,
  start: Exclude<SessionStart, 'inferred'>,
): ListeningSession {
  const previous = state.sessions.at(-1);
  const number = (previous?.number ?? 0) + 1;
  let id = `session-${number}`;
  for (let suffix = 2; state.sessions.some((s) => s.id === id); suffix += 1)
    id = `session-${number}-${suffix}`;
  // Undated legacy decisions are attributed by start date, so a start date
  // never moves before the previous session even if the clock went backwards.
  const startedAt =
    previous && Date.parse(at) < Date.parse(previous.startedAt)
      ? previous.startedAt
      : at;
  const session: ListeningSession = {
    id,
    number,
    startedAt,
    lastActivityAt: start === 'manual' ? null : startedAt,
    start,
    roundIds: [state.crate.id],
  };
  state.sessions.push(session);
  return session;
}

function includeRound(session: ListeningSession, crateId: string): void {
  if (!session.roundIds.includes(crateId)) session.roundIds.push(crateId);
}

/**
 * Record a genuine listening action (Keep/Pass/Later, Undo or opening a
 * round) on a draft state. More than 14 days after the last one, this starts
 * an automatic session first. Reads, imports and profile edits never call
 * this, so reloading or an agent's import cannot create or extend a session.
 */
export function recordListeningActivity(
  state: Payload,
  at: string,
): ListeningSession {
  let session = state.sessions.at(-1);
  if (!session || isSessionStale(session, Date.parse(at)))
    session = newSession(state, at, 'automatic');
  if (
    session.lastActivityAt === null ||
    Date.parse(at) > Date.parse(session.lastActivityAt)
  )
    session.lastActivityAt = at;
  includeRound(session, state.crate.id);
  return session;
}

/** Start a manual session on a draft state. Callers check it is allowed. */
export function startManualSession(
  state: Payload,
  at: string,
): ListeningSession {
  return newSession(state, at, 'manual');
}

// ---------------------------------------------------------------------------
// Summaries for the header, Past sessions, exports and the agent brief
// ---------------------------------------------------------------------------

export type SessionStatus = 'current' | 'next' | 'past';

/** Counts and track lists for one session or for every session. */
export interface ScopeSummary {
  kind: 'session' | 'all';
  /** Session ID, or `all`. */
  id: string;
  label: string;
  /** `next` is the session the next decision starts; it is not saved yet. */
  status: SessionStatus | 'all';
  number?: number;
  start?: SessionStart;
  startedAt: string | null;
  lastActivityAt: string | null;
  note?: string;
  rounds: RoundRef[];
  /**
   * Session candidates: tracks in its rounds, then any older tracks decided
   * during it. Rounds can span sessions, so candidates can overlap.
   */
  trackIds: string[];
  /** Current Keeps decided during this scope, oldest first. */
  keptIds: string[];
  /** Candidates with any current decision, whenever it was made. */
  decided: number;
}

function sessionAt(
  sessions: ListeningSession[],
  at: string,
): ListeningSession | undefined {
  const time = Date.parse(at);
  let found = sessions[0];
  for (const session of sessions)
    if (Date.parse(session.startedAt) <= time) found = session;
  return found;
}

/** Session ID for each current decision: its saved ID, else its date window. */
export function decisionSessionIds(
  state: Pick<Payload, 'sessions' | 'votes' | 'tracks'>,
): Map<string, string> {
  const known = new Set(state.sessions.map((session) => session.id));
  const result = new Map<string, string>();
  for (const [trackId, vote] of Object.entries(state.votes)) {
    if (!state.tracks[trackId]) continue;
    const sessionId =
      vote.sessionId && known.has(vote.sessionId)
        ? vote.sessionId
        : sessionAt(state.sessions, vote.at)?.id;
    if (sessionId) result.set(trackId, sessionId);
  }
  return result;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
const byDecisionTime =
  (votes: Record<string, Vote>) => (a: string, b: string) =>
    votes[a].at.localeCompare(votes[b].at);

function summarise(
  state: Payload,
  rounds: Map<string, RoundEntry>,
  decided: Map<string, string>,
  scope: Pick<
    ScopeSummary,
    | 'id'
    | 'number'
    | 'start'
    | 'startedAt'
    | 'lastActivityAt'
    | 'note'
    | 'status'
  > & { roundIds: string[] },
): ScopeSummary {
  const madeHere = Object.keys(state.votes)
    .filter((trackId) => decided.get(trackId) === scope.id)
    .sort(byDecisionTime(state.votes));
  const trackIds = unique([
    ...scope.roundIds.flatMap((id) => rounds.get(id)?.trackIds ?? []),
    ...madeHere,
  ]);
  const { roundIds, ...rest } = scope;
  return {
    ...rest,
    kind: 'session',
    label: sessionLabel(scope.number ?? 0),
    rounds: roundIds.map((id) => rounds.get(id)?.ref ?? roundRef(id, id)),
    trackIds,
    keptIds: madeHere.filter((id) => state.votes[id].verdict === 'keep'),
    decided: trackIds.filter((id) => state.votes[id]).length,
  };
}

/**
 * Every session, newest first. The first entry is the live session: either
 * `current`, or `next` when more than 14 days have passed and the next
 * decision will start a new one. The live session always includes the active
 * round and Up next, so newly prepared rounds count as candidates without
 * starting or extending a session.
 */
export function listSessionSummaries(
  state: Payload,
  now: number,
): ScopeSummary[] {
  const rounds = catalogueRounds(state);
  const decided = decisionSessionIds(state);
  const last = state.sessions.at(-1);
  const pending = !last || isSessionStale(last, now);
  const liveRoundIds = [
    state.crate.id,
    ...state.queuedRounds.map((round) => round.id),
  ];
  const summaries = state.sessions.map((session, index) => {
    const live = !pending && index === state.sessions.length - 1;
    return summarise(state, rounds, decided, {
      id: session.id,
      number: session.number,
      start: session.start,
      startedAt: session.startedAt,
      lastActivityAt: session.lastActivityAt,
      note: session.note,
      status: live ? 'current' : 'past',
      roundIds: live
        ? unique([...session.roundIds, ...liveRoundIds])
        : session.roundIds,
    });
  });
  if (pending) {
    const number = (last?.number ?? 0) + 1;
    summaries.push(
      summarise(state, rounds, decided, {
        id: `session-${number}`,
        number,
        startedAt: null,
        lastActivityAt: null,
        status: 'next',
        roundIds: liveRoundIds,
      }),
    );
  }
  return summaries.reverse().map((summary) => {
    // Past sessions are the complete record. Only the live buying session
    // applies its requested store policy; excluded votes remain global taste.
    if (summary.status === 'past' || !state.profile.requireBeatport)
      return summary;
    const ready = (id: string) =>
      Boolean(state.tracks[id] && isAuditionReady(state.tracks[id], true));
    const trackIds = summary.trackIds.filter(ready);
    return {
      ...summary,
      trackIds,
      keptIds: summary.keptIds.filter(ready),
      decided: trackIds.filter((id) => state.votes[id]).length,
    };
  });
}

export function allSessionsSummary(state: Payload): ScopeSummary {
  const kept = Object.keys(state.votes)
    .filter(
      (trackId) =>
        state.tracks[trackId] && state.votes[trackId].verdict === 'keep',
    )
    .sort(byDecisionTime(state.votes));
  return {
    kind: 'all',
    id: 'all',
    label: 'All sessions',
    status: 'all',
    startedAt: state.sessions[0]?.startedAt ?? null,
    lastActivityAt: state.sessions.at(-1)?.lastActivityAt ?? null,
    rounds: [...catalogueRounds(state).values()].map((entry) => entry.ref),
    trackIds: Object.keys(state.tracks),
    keptIds: kept,
    decided: Object.keys(state.votes).filter((id) => state.tracks[id]).length,
  };
}

/**
 * Resolve an export scope: `current` (the live session, the buying default),
 * `all`, or a saved session ID. Unknown scopes return undefined.
 */
export function scopeSummary(
  state: Payload,
  scope: string,
  now: number,
): ScopeSummary | undefined {
  if (scope === 'all') return allSessionsSummary(state);
  const sessions = listSessionSummaries(state, now);
  if (scope === 'current') return sessions[0];
  return sessions.find(
    (summary) => summary.id === scope && summary.status !== 'next',
  );
}
