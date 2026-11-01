// One ordering rule for the Keep list and its exports. Date added means added
// to Keeps; it uses the saved decision date, not a store release date.
import type { Track, Vote } from './types.ts';

export type KeepSort = 'recommended' | 'newest' | 'oldest';
const STORAGE_KEY = 'agentic-dj:keep-sort:v1';
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem'>;

export function isKeepSort(value: unknown): value is KeepSort {
  return value === 'recommended' || value === 'newest' || value === 'oldest';
}

export function readKeepSort(
  getStore: StorageAccess = () => window.localStorage,
): KeepSort {
  try {
    const value = getStore().getItem(STORAGE_KEY);
    return isKeepSort(value) ? value : 'recommended';
  } catch {
    return 'recommended';
  }
}

export function saveKeepSort(
  value: KeepSort,
  getStore: StorageAccess = () => window.localStorage,
): void {
  try {
    getStore().setItem(STORAGE_KEY, value);
  } catch {
    /* Private browsing can disallow storage. */
  }
}

export function sortKeepTracks(
  tracks: Track[],
  votes: Record<string, Vote>,
  sort: KeepSort,
): Track[] {
  return [...tracks].sort((a, b) => {
    if (sort === 'recommended') {
      const rank =
        (a.setPlacement?.rank ?? Number.POSITIVE_INFINITY) -
        (b.setPlacement?.rank ?? Number.POSITIVE_INFINITY);
      if (rank && !Number.isNaN(rank)) return rank;
    }
    const added =
      Date.parse(votes[a.id]?.at || '') - Date.parse(votes[b.id]?.at || '');
    return Number.isFinite(added) ? added * (sort === 'newest' ? -1 : 1) : 0;
  });
}

export function totalDuration(tracks: Pick<Track, 'seconds'>[]): {
  label: string;
  missing: number;
} {
  const seconds = tracks.reduce((sum, track) => sum + (track.seconds ?? 0), 0);
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return {
    label: hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`,
    missing: tracks.filter((track) => !track.seconds).length,
  };
}
