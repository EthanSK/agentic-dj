export type Verdict = 'keep' | 'pass' | 'later';
export type Access = 'start-here' | 'deeper' | 'curveball';
export interface Track {
  id: string;
  artist: string;
  title: string;
  lane: string;
  genres?: string[];
  traits?: string[];
  reason: string;
  setRole: string;
  accessibility: Access;
  preview?: { provider: 'bandcamp' | 'spotify'; id: string };
  artwork?: string;
  seconds?: number;
  bpm?: number;
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
}
export interface HistoryEntry {
  id: string;
  trackId: string;
  before: Vote | null;
  after: Vote;
  undone: boolean;
  at: string;
}
export interface Payload {
  schemaVersion: 1;
  crate: Omit<Crate, 'tracks'> & { trackIds: string[] };
  tracks: Record<string, Track>;
  votes: Record<string, Vote>;
  history: HistoryEntry[];
  profile: { brief: string; avoid: string; seeds: string };
  requestIds: string[];
}
export interface DeskState extends Payload {
  revision: number;
  updatedAt: string;
}
