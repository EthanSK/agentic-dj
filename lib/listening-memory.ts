// Tab-local recovery: remember the selected record and actual preview starts
// across reloads without changing votes or automatically restarting audio.
import { isSafeId } from './ids.ts';

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const CURSOR = 'agentic-dj:listening-cursor:v1';
const PLAYS = 'agentic-dj:recent-plays:v1';
type Cursor = {
  crateId: string;
  trackId: string;
  view: 'unheard' | 'keep' | 'later' | 'all';
};
export type RecentPlay = { trackId: string; at: string };
const browserStore = () => window.sessionStorage;

export function readListeningCursor(
  crateId: string,
  getStore: () => Store = browserStore,
): Cursor | null {
  try {
    const value = JSON.parse(getStore().getItem(CURSOR) || 'null');
    return value?.crateId === crateId &&
      isSafeId(value.trackId) &&
      ['unheard', 'keep', 'later', 'all'].includes(value.view)
      ? value
      : null;
  } catch {
    return null;
  }
}

export function saveListeningCursor(
  value: Cursor,
  getStore: () => Store = browserStore,
): void {
  try {
    getStore().setItem(CURSOR, JSON.stringify(value));
  } catch {
    /* Listening still works without storage. */
  }
}

export function recentPlays(
  getStore: () => Store = browserStore,
): RecentPlay[] {
  try {
    const value = JSON.parse(getStore().getItem(PLAYS) || '[]');
    return Array.isArray(value)
      ? value
          .filter(
            (v) =>
              isSafeId(v?.trackId) &&
              typeof v.at === 'string' &&
              Number.isFinite(Date.parse(v.at)),
          )
          .slice(0, 12)
      : [];
  } catch {
    return [];
  }
}

export function rememberPlayedTrack(
  trackId: string,
  getStore: () => Store = browserStore,
): void {
  if (!isSafeId(trackId)) return;
  try {
    getStore().setItem(
      PLAYS,
      JSON.stringify(
        [
          { trackId, at: new Date().toISOString() },
          ...recentPlays(getStore).filter((p) => p.trackId !== trackId),
        ].slice(0, 12),
      ),
    );
  } catch {
    /* A failed history write must not stop a preview. */
  }
}
