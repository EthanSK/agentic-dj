export type Verdict = 'keep' | 'pass' | 'later';
export type Access = 'start-here' | 'deeper' | 'curveball';
/** Discovery is where a suggestion came from, separately from its audio/store. */
export interface TrackDiscovery {
  source: 'spotify-likes' | 'agent' | 'rekordbox' | 'user';
  basedOn?: 'past-likes' | 'birthday' | 'request';
}
/** One crate a track was part of. A track can belong to several rounds. */
export interface RoundRef {
  crateId: string;
  title: string;
  round?: number;
}
export interface Track {
  rounds?: RoundRef[];
  discovery?: TrackDiscovery;
  /** Agent-proposed running order, not proof that adjacent tracks mix cleanly. */
  setPlacement?: {
    rank: number;
    note: string;
    section?: 'beginning' | 'middle' | 'end';
  };
  /** User and agent context stay distinct; these are preferences, not action authority. */
  notes?: { user?: string; agent?: string };
  /** Ethan's rough beginning/middle/end hint, 0–100; never a fixed playlist slot. */
  setPosition?: number;
  id: string;
  artist: string;
  title: string;
  lane: string;
  genres?: string[];
  traits?: string[];
  reason: string;
  setRole: string;
  accessibility: Access;
  preview?: { provider: 'bandcamp' | 'beatport' | 'spotify'; id: string };
  artwork?: string;
  seconds?: number;
  bpm?: number;
  alternateBpm?: number;
  musicalKey?: string;
  tempoNote?: string;
  label?: string;
  released?: string;
  sourceUrl: string;
  sourceName: string;
  checkedAt?: string;
  isrc?: string;
  price?: {
    amount: number;
    currency: string;
    kind: 'fixed' | 'minimum';
    scope: 'track' | 'release';
    checkedAt: string;
  };
  caution?: string;
  suggestedBy?: string;
}
export interface Crate {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string;
  round?: number;
  tracks: Track[];
}
/** A crate without its track bodies: the active round or a queued one. */
export type CrateHeader = Omit<Crate, 'tracks'> & { trackIds: string[] };
export interface TasteSignal {
  label: string;
  score: number;
  kind: 'genre' | 'trait';
}
export interface TasteMap {
  decided: number;
  positive: TasteSignal[];
  negative: TasteSignal[];
}
export interface Vote {
  verdict: Verdict;
  note: string;
  tags: string[];
  at: string;
  /**
   * Listening session that was current when this decision was made. Votes
   * saved before sessions existed have none; they are attributed by date.
   */
  sessionId?: string;
}
export interface HistoryEntry {
  id: string;
  trackId: string;
  before: Vote | null;
  after: Vote;
  undone: boolean;
  at: string;
}
/**
 * How a listening session began:
 * - `inferred`: reconstructed from saved decision dates during the upgrade;
 * - `automatic`: the first decision after more than 14 days away;
 * - `manual`: the listener chose New session.
 */
export type SessionStart = 'inferred' | 'automatic' | 'manual';
/**
 * A listening and shopping period that can span several rounds. Sessions
 * scope the buying shortlist; taste evidence still uses every decision.
 */
export interface ListeningSession {
  id: string;
  /** 1-based display number: Session 1, Session 2, … */
  number: number;
  startedAt: string;
  /** Last genuine listening activity. Null for a new manual session. */
  lastActivityAt: string | null;
  start: SessionStart;
  /** Crate IDs opened or listened to during this session, oldest first. */
  roundIds: string[];
  /** Plain explanation of any inference uncertainty. */
  note?: string;
}
/** A prepared round waiting for the listener to open it explicitly. */
export type QueuedRound = CrateHeader & { queuedAt: string };
export interface Payload {
  schemaVersion: 1;
  crate: CrateHeader;
  tracks: Record<string, Track>;
  votes: Record<string, Vote>;
  history: HistoryEntry[];
  profile: {
    brief: string;
    avoid: string;
    seeds: string;
    requireBeatport?: boolean;
  };
  requestIds: string[];
  sessions: ListeningSession[];
  queuedRounds: QueuedRound[];
}
/**
 * The persisted shape. Installations saved before listening sessions have no
 * `sessions` or `queuedRounds`; reads normalise them without writing, and the
 * next ordinary mutation persists the result. Both fields are additive, so an
 * older app version keeps them intact when it saves (it clones the payload).
 */
export type StoredPayload = Omit<Payload, 'sessions' | 'queuedRounds'> &
  Partial<Pick<Payload, 'sessions' | 'queuedRounds'>>;
export interface DeskState extends Payload {
  revision: number;
  updatedAt: string;
}
