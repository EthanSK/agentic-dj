'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Disc3,
  Headphones,
  History,
  Info,
  ListFilter,
  ListMusic,
  Plus,
  Play,
  Pause,
  RotateCcw,
  Search,
  Settings2,
  SkipForward,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PreviewPlayer, usePreviewAudio } from '@/components/preview-player';
import { DiscoveryBadge } from '@/components/discovery-badge';
import {
  readListeningCursor,
  saveListeningCursor,
  recentPlays,
  type RecentPlay,
} from '@/lib/listening-memory';
import {
  isKeepSort,
  readKeepSort,
  saveKeepSort,
  sortKeepTracks,
  totalDuration,
  type KeepSort,
} from '@/lib/keep-order';
import {
  isAuditionReady,
  musicStoreLink,
  playablePreviewId,
} from '@/lib/preview-source';
import { activeTracks, tasteMap, validateCrate } from '@/lib/domain';
import {
  allSessionsSummary,
  decisionSessionIds,
  listSessionSummaries,
  type ScopeSummary,
} from '@/lib/sessions';
import { DEFAULT_PREVIEW_VOLUME, normalisePreviewVolume } from '@/lib/player';
import {
  readPreviewPreferences,
  savePreviewPreferences,
} from '@/lib/preview-preferences';
import type {
  Crate,
  DeskState,
  QueuedRound,
  RoundRef,
  TasteMap,
  Track,
  Verdict,
} from '@/lib/types';

type View = 'unheard' | 'keep' | 'later' | 'all';
type ImportMode = 'queue' | 'new-crate' | 'append';
/**
 * What the queue rail lists. `round` is the normal listening flow (the active
 * round, with this session's Keeps under Keep). Past sessions can switch the
 * rail to one session or to every session without touching playback.
 */
type RailScope =
  | { kind: 'round' }
  | { kind: 'session'; id: string }
  | { kind: 'all' };
const emptyTags: string[] = [];
const feedbackTags = [
  'Dopamine',
  'Deep kick',
  'Great drums',
  'Great bass',
  'Love the groove',
  'Warm / soulful',
  'Too commercial',
  'Cringe / cheesy',
  'Too dark',
  'Too fast',
  'Too repetitive',
  'Vocals put me off',
  'Not my thing',
];

function money(track: Track): string {
  if (!track.price) return 'Check store price';
  const price = track.price;
  const amount = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: price.currency,
  }).format(price.amount);
  return `${amount}${price.kind === 'minimum' ? '+' : ''} ${price.currency}${price.scope === 'release' ? ' / release' : ''}`;
}
function duration(seconds?: number) {
  const total = Math.round(seconds || 0);
  return total
    ? `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
    : '—';
}
function released(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
function tempo(track: Track) {
  if (!track.bpm) return '—';
  return track.alternateBpm
    ? `${track.bpm} / ${track.alternateBpm}`
    : String(track.bpm);
}
function shortDate(value: string, withYear = false) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}
/** "Since 29 Oct", "29 Oct – 1 Nov 2026", or the not-yet-started note. */
function sessionDates(summary: ScopeSummary) {
  if (!summary.startedAt) return 'Starts with your next decision';
  if (summary.status === 'current')
    return `Since ${shortDate(summary.startedAt, true)}`;
  const end = summary.lastActivityAt ?? summary.startedAt;
  const first = shortDate(summary.startedAt);
  const last = shortDate(end, true);
  return shortDate(summary.startedAt, true) === last
    ? last
    : `${first} – ${last}`;
}
/** "Round 13", "Rounds 2–12", or crate names for unnumbered rounds. */
function roundsText(rounds: RoundRef[]) {
  const numbers = [
    ...new Set(rounds.flatMap((r) => (r.round != null ? [r.round] : []))),
  ].sort((a, b) => a - b);
  const parts: string[] = [];
  if (numbers.length === 1) parts.push(`Round ${numbers[0]}`);
  else if (numbers.length) {
    const consecutive = numbers.every(
      (value, index) => !index || value === numbers[index - 1] + 1,
    );
    parts.push(
      consecutive
        ? `Rounds ${numbers[0]}–${numbers.at(-1)}`
        : `Rounds ${numbers.join(', ')}`,
    );
  }
  parts.push(...rounds.filter((r) => r.round == null).map((r) => r.title));
  return parts.join(' · ') || 'No rounds yet';
}
function roundName(round: { round?: number; title: string }) {
  return round.round != null ? `Round ${round.round}` : round.title;
}

function Earprint({ map }: { map: TasteMap; complete?: boolean }) {
  if (!map.decided)
    return (
      <div className="earprint-empty">
        <p>No decisions yet.</p>
      </div>
    );
  return (
    <div className="earprint-map">
      <div className="signal-group positive">
        <span>More like</span>
        <div>
          {map.positive.length ? (
            map.positive.map((signal) => (
              <i key={`${signal.kind}-${signal.label}`}>{signal.label}</i>
            ))
          ) : (
            <small>None yet</small>
          )}
        </div>
      </div>
      <div className="signal-group negative">
        <span>Less like</span>
        <div>
          {map.negative.length ? (
            map.negative.map((signal) => (
              <i key={`${signal.kind}-${signal.label}`}>{signal.label}</i>
            ))
          ) : (
            <small>None yet</small>
          )}
        </div>
      </div>
    </div>
  );
}

export function ListeningDesk() {
  const [state, setState] = useState<DeskState | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [browsedId, setBrowsedId] = useState<string | null>(null);
  const pendingMainPlay = useRef<Track | null>(null);
  const [view, setView] = useState<View>('unheard');
  const [lane, setLane] = useState('all');
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [keepSort, setKeepSort] = useState<KeepSort>('recommended');
  const [playHistory, setPlayHistory] = useState<RecentPlay[]>([]);
  const [playersAllowed, setPlayersAllowed] = useState(false);
  const [previewVolume, setPreviewVolume] = useState(DEFAULT_PREVIEW_VOLUME);
  const previewAudio = usePreviewAudio({
    enabled: playersAllowed,
    volume: previewVolume,
  });
  const stopPreview = previewAudio.stop;
  const loadedCrateId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [confirmNewSession, setConfirmNewSession] = useState(false);
  const sessionsButton = useRef<HTMLButtonElement | null>(null);
  const closeSessions = useCallback(() => {
    setSessionsOpen(false);
    setConfirmNewSession(false);
    sessionsButton.current?.focus({ preventScroll: true });
  }, []);
  const [scope, setScope] = useState<RailScope>({ kind: 'round' });
  // Session staleness depends on the clock. It is refreshed whenever saved
  // state arrives, so render stays pure and the server makes the real call.
  const [now, setNow] = useState(0);
  const [drafts, setDrafts] = useState<
    Record<string, { note: string; tags: string[] }>
  >({});
  const [profile, setProfile] = useState({ brief: '', avoid: '', seeds: '' });
  const [importCrate, setImportCrate] = useState<Crate | null>(null);
  // Ethan's 'only add to the end': preserve the remaining queue on import.
  const [importMode, setImportMode] = useState<ImportMode>('append');
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const saved = readPreviewPreferences();
    // Hydrate after mount to keep server and initial client markup identical.
    // oxlint-disable-next-line react/react-compiler
    setPreviewVolume(saved.volume);
    setPlayersAllowed(saved.playersAllowed);
    setKeepSort(readKeepSort());
    setPlayHistory(recentPlays());
  }, []);

  const load = useCallback(async (initial = false) => {
    try {
      const response = await fetch('/api/state', { cache: 'no-store' });
      if (!response.ok)
        throw new Error(
          'Could not load your local library. Check that Agentic DJ is running, then retry.',
        );
      const next: DeskState = await response.json();
      setState(next);
      setNow(Date.now());
      setError('');
      // A crate changed somewhere else resets browsing, but not playback:
      // round changes must leave a playing preview alone.
      if (initial || loadedCrateId.current !== next.crate.id) {
        setProfile(next.profile);
        setScope({ kind: 'round' });
        const cursor = initial ? readListeningCursor(next.crate.id) : null;
        const resume =
          cursor &&
          next.tracks[cursor.trackId] &&
          isAuditionReady(next.tracks[cursor.trackId])
            ? cursor
            : null;
        setView(resume?.view ?? 'unheard');
        setLane('all');
        setQuery('');
        setActiveId((current) =>
          !initial && current && next.tracks[current]
            ? current
            : (resume?.trackId ??
              next.crate.trackIds.find(
                (id) =>
                  !next.votes[id] &&
                  isAuditionReady(
                    next.tracks[id],
                    next.profile.requireBeatport,
                  ),
              ) ??
              null),
        );
      }
      loadedCrateId.current = next.crate.id;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not connect to the local server.',
      );
    }
  }, []);
  useEffect(() => {
    void load(true); // oxlint-disable-line react/react-compiler -- State changes occur only after the external API read resolves.
  }, [load]);

  useEffect(() => {
    if (state && activeId)
      saveListeningCursor({ crateId: state.crate.id, trackId: activeId, view });
  }, [state, activeId, view]);
  useEffect(() => {
    if (previewAudio.phase === 'playing') setPlayHistory(recentPlays()); // oxlint-disable-line react/react-compiler -- Read history after an actual preview start.
  }, [previewAudio.phase, previewAudio.activeTrack?.trackId]);

  const changePreviewVolume = (value: number) => {
    const volume = normalisePreviewVolume(value);
    setPreviewVolume(volume);
    savePreviewPreferences({ volume });
  };

  const changePlayersAllowed = (allowed: boolean) => {
    setPlayersAllowed(allowed);
    savePreviewPreferences({ playersAllowed: allowed });
  };

  const tracks = useMemo(
    () =>
      state
        ? activeTracks(state).filter((t) =>
            isAuditionReady(t, state.profile.requireBeatport),
          )
        : [],
    [state],
  );
  // Newest first; [0] is the live session (current, or the next one when the
  // last decision was more than 14 days ago).
  const sessionList = useMemo(
    () => (state ? listSessionSummaries(state, now) : []),
    [state, now],
  );
  const liveSession: ScopeSummary | undefined = sessionList[0];
  const everySession = useMemo(
    () => (state ? allSessionsSummary(state) : null),
    [state],
  );
  // Null means the normal round view.
  const viewedScope: ScopeSummary | null =
    scope.kind === 'all'
      ? everySession
      : scope.kind === 'session'
        ? (sessionList.find((summary) => summary.id === scope.id) ?? null)
        : null;
  const scopeTracks = useMemo(
    () =>
      state && viewedScope
        ? viewedScope.trackIds
            .map((id) => state.tracks[id])
            .filter(
              (t) =>
                t &&
                isAuditionReady(
                  t,
                  viewedScope.status !== 'past' &&
                    viewedScope.kind !== 'all' &&
                    state.profile.requireBeatport,
                ),
            )
        : tracks,
    [state, viewedScope, tracks],
  );
  // Keep lists the viewed scope's Keeps, or this session's in the round view:
  // the buying shortlist, not every Keep ever made.
  const keptIds = (viewedScope ?? liveSession)?.keptIds;
  const keepers = useMemo(
    () =>
      state && keptIds
        ? keptIds
            .map((id) => state.tracks[id])
            .filter((t) => t && isAuditionReady(t))
        : [],
    [state, keptIds],
  );
  const queueTracks = useMemo(
    () =>
      view === 'keep'
        ? sortKeepTracks(keepers, state?.votes ?? {}, keepSort)
        : scopeTracks,
    [view, keepers, state?.votes, keepSort, scopeTracks],
  );
  const lanes = useMemo(
    () => [...new Set(queueTracks.map((t) => t.lane))],
    [queueTracks],
  );
  const counts = useMemo(
    () => ({
      keep: tracks.filter((t) => state?.votes[t.id]?.verdict === 'keep').length,
      pass: tracks.filter((t) => state?.votes[t.id]?.verdict === 'pass').length,
      later: tracks.filter((t) => state?.votes[t.id]?.verdict === 'later')
        .length,
      unheard: tracks.filter((t) => !state?.votes[t.id]).length,
    }),
    [tracks, state],
  );
  // Tab counts follow whatever the rail lists; `counts` stays round-only for
  // round progress and the completed-round summary.
  const listCounts = useMemo(
    () => ({
      later: scopeTracks.filter((t) => state?.votes[t.id]?.verdict === 'later')
        .length,
      unheard: scopeTracks.filter((t) => !state?.votes[t.id]).length,
    }),
    [scopeTracks, state],
  );
  const inferredTaste = useMemo(
    () =>
      state ? tasteMap(state) : { decided: 0, positive: [], negative: [] },
    [state],
  );
  const scopedTaste = useMemo(() => {
    if (!state) return null;
    const currentIds = new Set<string>();
    const previousIds = new Set<string>();
    for (const [trackId, sessionId] of decisionSessionIds(state)) {
      (sessionId === liveSession?.id ? currentIds : previousIds).add(trackId);
    }
    return {
      current: tasteMap(state, currentIds),
      previous: tasteMap(state, previousIds),
    };
  }, [state, liveSession?.id]);
  const queue = useMemo(
    () =>
      queueTracks.filter((t) => {
        const verdict = state?.votes[t.id]?.verdict;
        const matchView =
          view === 'all' || (view === 'unheard' ? !verdict : verdict === view);
        return (
          matchView &&
          (lane === 'all' || t.lane === lane) &&
          `${t.artist} ${t.title} ${t.lane}`
            .toLowerCase()
            .includes(query.toLowerCase())
        );
      }),
    [queueTracks, state, view, lane, query],
  );
  const selectedTrack = activeId ? state?.tracks[activeId] : null;
  const browsedTrack = browsedId ? state?.tracks[browsedId] : null;
  const queueDuration = totalDuration(queue);
  const track =
    selectedTrack && isAuditionReady(selectedTrack) ? selectedTrack : null;
  const draft = activeId ? drafts[activeId] : undefined;
  const savedVote = activeId ? state?.votes[activeId] : undefined;
  const note = draft?.note ?? savedVote?.note ?? '';
  const tags = draft?.tags ?? savedVote?.tags ?? emptyTags;
  const lastDecision = state?.history
    .slice()
    .reverse()
    .find((h) => !h.undone);
  const currentIndex = track ? tracks.findIndex((t) => t.id === track.id) : -1;
  const decided = counts.keep + counts.pass + counts.later;
  const round = state?.crate.round || 1;
  const roundComplete = Boolean(tracks.length && counts.unheard === 0);
  const nextPreviewTrack = useMemo(() => {
    if (!track) return null;
    const candidates = tracks
      .slice(currentIndex + 1)
      .filter((t) => !state?.votes[t.id]);
    return (
      candidates.find((candidate) => playablePreviewId(candidate.preview)) ||
      null
    );
  }, [currentIndex, tracks, state, track]);
  const preloadPreview = previewAudio.preload;
  const togglePreview = previewAudio.toggle;
  const playPreview = previewAudio.play;

  function selectTrack(selected: Track) {
    setActiveId(selected.id);
    const previewId = playablePreviewId(selected.preview);
    if (playersAllowed && previewId) {
      void playPreview({
        trackId: previewId,
        recordId: selected.id,
        title: selected.title,
        artist: selected.artist,
      });
    } else {
      stopPreview();
    }
  }

  const navigatePlayer = useCallback(
    (direction: number) => {
      if (!tracks.length) return;
      const index = tracks.findIndex((t) => t.id === track?.id);
      const next = tracks[(index + direction + tracks.length) % tracks.length];
      const wasPlaying = stopPreview();
      setActiveId(next.id);
      const previewId = playablePreviewId(next.preview);
      if (wasPlaying && playersAllowed && previewId)
        void playPreview({
          trackId: previewId,
          recordId: next.id,
          title: next.title,
          artist: next.artist,
        });
    },
    [tracks, track?.id, stopPreview, playersAllowed, playPreview],
  );

  function toggleMainPreview() {
    if (!track) return;
    if (!playersAllowed) {
      pendingMainPlay.current = track;
      changePlayersAllowed(true);
      return;
    }
    const previewId = playablePreviewId(track.preview);
    if (previewId)
      void togglePreview({
        trackId: previewId,
        recordId: track.id,
        title: track.title,
        artist: track.artist,
      });
  }

  useEffect(() => {
    const pending = pendingMainPlay.current;
    if (!playersAllowed || !pending) return;
    pendingMainPlay.current = null;
    const previewId = playablePreviewId(pending.preview);
    if (previewId)
      void playPreview({
        trackId: previewId,
        recordId: pending.id,
        title: pending.title,
        artist: pending.artist,
      });
  }, [playersAllowed, playPreview]);

  useEffect(() => {
    if (!playersAllowed) return;
    void preloadPreview(playablePreviewId(track?.preview));
    void preloadPreview(playablePreviewId(nextPreviewTrack?.preview));
  }, [nextPreviewTrack, playersAllowed, preloadPreview, track]);

  const command = useCallback(
    async (body: Record<string, unknown>): Promise<DeskState | null> => {
      if (!state || busyRef.current) return null;
      busyRef.current = true;
      setBusy(true);
      setError('');
      setNotice('');
      try {
        const response = await fetch('/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...body,
            expectedRevision: state.revision,
            requestId: crypto.randomUUID(),
          }),
        });
        const data = (await response.json()) as DeskState & {
          error?: string;
          state?: DeskState;
        };
        if (!response.ok) {
          if (data.state) setState(data.state);
          throw new Error(
            data.error || 'Could not save. Reload to check your last decision.',
          );
        }
        setState(data);
        setNow(Date.now());
        // Our own round change is not an external one for a later reload.
        loadedCrateId.current = data.crate.id;
        return data;
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : 'Connection lost. Reload to check whether your decision was saved.',
        );
        return null;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [state],
  );

  const decide = useCallback(
    async (verdict: Verdict) => {
      if (!track) return;
      const oldIndex = tracks.findIndex((t) => t.id === track.id);
      const next = await command({
        type: 'vote',
        trackId: track.id,
        verdict,
        note,
        tags,
      });
      if (!next) return;
      const wasPlaying = stopPreview();
      setDrafts((current) => {
        const updated = { ...current };
        delete updated[track.id];
        return updated;
      });
      setNotice(
        `${verdict === 'keep' ? 'Kept' : verdict === 'pass' ? 'Passed' : 'Saved for later'} ${track.title} · saved locally.`,
      );
      // The completed-round handoff belongs to the round view. While browsing
      // a session, deciding its last round track just moves along the list.
      if (
        !viewedScope &&
        tracks.some((candidate) => !state?.votes[candidate.id]) &&
        tracks.every((candidate) => next.votes[candidate.id])
      ) {
        setView('unheard');
        setLane('all');
        setQuery('');
        setActiveId(null);
        return;
      }
      const remaining = tracks.filter(
        (t) => t.id !== track.id && !next.votes[t.id],
      );
      const nextTrack =
        remaining.find((t) => tracks.indexOf(t) > oldIndex) ?? remaining[0];
      setActiveId(nextTrack?.id || null);
      const nextPreviewId = playablePreviewId(nextTrack?.preview);
      if (wasPlaying && nextTrack && nextPreviewId) {
        void togglePreview({
          trackId: nextPreviewId,
          recordId: nextTrack.id,
          title: nextTrack.title,
          artist: nextTrack.artist,
        });
      }
    },
    [
      track,
      tracks,
      viewedScope,
      command,
      note,
      tags,
      stopPreview,
      togglePreview,
      state,
    ],
  );

  const undo = useCallback(async () => {
    if (!lastDecision) return;
    const next = await command({ type: 'undo', eventId: lastDecision.id });
    if (next) {
      stopPreview();
      setActiveId(lastDecision.trackId);
      setView('all');
      setLane('all');
      setQuery('');
      setNotice('Last decision undone · saved locally.');
    }
  }, [lastDecision, command, stopPreview]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && sessionsOpen) {
        event.preventDefault();
        closeSessions();
        return;
      }
      const el = event.target as HTMLElement;
      if (
        event.repeat ||
        busyRef.current ||
        settings ||
        sessionsOpen ||
        el.closest('input, textarea, select, [contenteditable="true"]') ||
        event.altKey
      )
        return;
      if (event.metaKey || event.ctrlKey) {
        if (event.key.toLowerCase() === 'z') {
          event.preventDefault();
          void undo();
        }
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        navigatePlayer(event.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        void decide('pass');
      }
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        void decide('keep');
      }
      if (event.key.toLowerCase() === 'l') {
        event.preventDefault();
        void decide('later');
      }
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        void undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [decide, undo, settings, sessionsOpen, closeSessions, navigatePlayer]);

  function pickView(nextView: View) {
    setView(nextView);
    setQuery('');
    setLane('all');
    // Browsing a list is not a request to replace the loaded record.
    setBrowsedId(null);
  }
  async function readImport(file?: File) {
    setImportCrate(null);
    setError('');
    if (!file) return;
    try {
      if (file.size > 900000)
        throw new Error('Use a crate JSON file smaller than 900 KB.');
      setImportCrate(validateCrate(JSON.parse(await file.text())));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not read that crate JSON.',
      );
    }
  }
  async function doImport() {
    if (!importCrate) return;
    const next = await command({
      type: 'import',
      mode: importMode,
      crate: importCrate,
    });
    if (next) {
      setImportCrate(null);
      setSettings(false);
      if (importMode === 'queue' || importMode === 'append') {
        // The current round and selection stay exactly as they were.
        setNotice(
          importMode === 'append'
            ? 'Tracks appended · saved locally.'
            : 'Crate added to Up next · saved locally.',
        );
        return;
      }
      setScope({ kind: 'round' });
      setView('unheard');
      setLane('all');
      setQuery('');
      setNotice(
        'Crate imported. Existing decisions and previous tracks are preserved locally.',
      );
    }
  }
  /**
   * Show one session, every session or the round in the queue rail. The
   * selected track and any playing preview stay as they are; only an
   * explicit track pick changes what plays.
   */
  function viewScope(next: RailScope) {
    setScope(next);
    setView(next.kind === 'round' ? 'unheard' : 'keep');
    setLane('all');
    setQuery('');
    closeSessions();
  }
  async function openRound(queued: QueuedRound) {
    const next = await command({ type: 'open-round', crateId: queued.id });
    if (!next) return;
    // Opening a round changes the list only. The loaded record and audio stay
    // together until the listener explicitly loads a track from that list.
    setScope({ kind: 'round' });
    setView('unheard');
    setLane('all');
    setQuery('');
    setNotice(`Opened ${queued.title} · saved locally.`);
  }
  async function startNewSession() {
    const next = await command({ type: 'new-session' });
    if (!next) return;
    setConfirmNewSession(false);
    // Selection, filters and playback are untouched; old decisions stay in
    // their own sessions.
    const started = next.sessions.at(-1);
    setNotice(
      `${started ? `Session ${started.number}` : 'New session'} started · saved locally.`,
    );
  }

  const savedLiveSession = state?.sessions.at(-1);
  const nextSessionNumber =
    liveSession?.status === 'next'
      ? (liveSession.number ?? 1)
      : (savedLiveSession?.number ?? 0) + 1;
  // A manual session with no decisions yet cannot be followed by another.
  const liveSessionEmpty =
    liveSession?.status === 'current' &&
    savedLiveSession?.lastActivityAt === null;
  const activeRoundName = state ? roundName(state.crate) : '';

  return (
    <main className="desk-shell" data-preview-policy="web-audio-only">
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="Agentic DJ home">
          <Disc3 size={25} strokeWidth={1.7} />
          <span>
            agentic<span className="wordmark-dj">dj</span>
          </span>
        </a>
        {/* The session, not the round, is the shopping period: its Keep
            count is the number Ethan asked to see at a glance. Round progress
            stays in the queue rail. */}
        <div className="crate-context" aria-label="Current session">
          <span className="local-badge">
            <i /> Local
          </span>
          {liveSession && (
            <>
              <strong
                title={
                  liveSession.status === 'next'
                    ? 'More than 14 days since your last decision. Your next decision starts this session.'
                    : undefined
                }
              >
                {liveSession.label}
              </strong>
              <span className="session-when">
                {liveSession.startedAt
                  ? `since ${shortDate(liveSession.startedAt)}`
                  : 'new'}
              </span>
              <span className="session-kept">
                {liveSession.keptIds.length} kept
              </span>
              <span
                className="session-progress"
                title={`${liveSession.decided} of ${liveSession.trackIds.length} session tracks decided`}
              >
                {liveSession.decided}/{liveSession.trackIds.length}
              </span>
            </>
          )}
        </div>
        <div className="header-actions">
          <Button
            variant="ghost"
            ref={sessionsButton}
            title="Past sessions"
            aria-expanded={sessionsOpen}
            aria-controls="past-sessions"
            onClick={() => {
              setSessionsOpen(!sessionsOpen);
              setConfirmNewSession(false);
            }}
          >
            <History size={16} />
            <span>Past sessions</span>
          </Button>
          <Button
            variant="ghost"
            aria-expanded={settings}
            aria-controls="taste-tools"
            onClick={() => setSettings(!settings)}
          >
            <Settings2 size={16} />
            <span>Tools</span>
          </Button>
          <a
            className="export-button"
            href={`/api/export?format=csv&session=current&sort=${keepSort}`}
            title={
              liveSession
                ? `${liveSession.label} keepers. Past sessions has the rest.`
                : undefined
            }
            aria-label={
              liveSession
                ? `Download ${liveSession.label} keepers as CSV`
                : 'Download keepers as CSV'
            }
          >
            <ArrowDownToLine size={15} />
            <span className="export-label">Keepers CSV</span>
            <span className="export-count">
              {liveSession?.keptIds.length ?? 0}
            </span>
          </a>
        </div>
      </header>

      {error && (
        <div role="alert" className="error-banner">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void load(!state)}>
            Reload saved state
          </Button>
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      )}

      {sessionsOpen && state && liveSession && everySession && (
        <section
          id="past-sessions"
          className="settings-panel sessions-panel"
          aria-label="Listening sessions"
        >
          <div className="settings-title">
            <div>
              <p className="eyebrow">PRIVATE & LOCAL</p>
              <h2>Sessions</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close sessions"
              onClick={closeSessions}
            >
              <X size={18} />
            </Button>
          </div>
          <p className="sessions-intro">
            A new session starts when you return after more than 14 days. Taste
            clues use every session.
          </p>
          <ol className="session-list">
            {[...sessionList, everySession].map((summary) => {
              const viewing =
                summary.kind === 'all'
                  ? scope.kind === 'all'
                  : scope.kind === 'session' && scope.id === summary.id;
              const exportScope =
                summary.kind === 'all'
                  ? 'all'
                  : summary.status === 'past'
                    ? summary.id
                    : 'current';
              return (
                <li
                  key={summary.id}
                  className={`session-row ${summary.kind === 'all' ? 'every-session' : ''} ${viewing ? 'viewing' : ''}`}
                >
                  <button
                    className="session-open"
                    aria-pressed={viewing}
                    aria-label={`Show ${summary.label} tracks`}
                    onClick={() =>
                      viewScope(
                        summary.kind === 'all'
                          ? { kind: 'all' }
                          : { kind: 'session', id: summary.id },
                      )
                    }
                  >
                    <span className="session-name">
                      <strong>{summary.label}</strong>
                      {summary.status === 'current' && (
                        <em className="session-badge">Current</em>
                      )}
                      {summary.status === 'next' && (
                        <em className="session-badge">Next</em>
                      )}
                    </span>
                    <span className="session-dates">
                      {sessionDates(summary)}
                    </span>
                    <span className="session-rounds">
                      {roundsText(summary.rounds)}
                    </span>
                    <span className="session-counts">
                      <b>{summary.keptIds.length} kept</b> · {summary.decided}/
                      {summary.trackIds.length} decided
                    </span>
                    {summary.start === 'inferred' && (
                      <small className="session-note">
                        Grouped from saved decision dates.
                        {summary.note ? ` ${summary.note}` : ''}
                      </small>
                    )}
                  </button>
                  {summary.keptIds.length > 0 && (
                    <a
                      className="session-csv"
                      href={`/api/export?format=csv&session=${exportScope}`}
                      aria-label={`Download ${summary.label} keepers as CSV`}
                    >
                      <ArrowDownToLine size={13} /> CSV
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="session-actions">
            {confirmNewSession ? (
              <fieldset
                className="new-session-confirm"
                aria-label="Confirm new session"
              >
                <p>
                  Start Session {nextSessionNumber} now?
                  {liveSession.status === 'current'
                    ? ` ${liveSession.label} moves to past sessions.`
                    : ''}
                </p>
                <Button disabled={busy} onClick={() => void startNewSession()}>
                  Start Session {nextSessionNumber}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmNewSession(false)}
                >
                  Cancel
                </Button>
              </fieldset>
            ) : (
              <Button
                variant="outline"
                disabled={busy || liveSessionEmpty}
                title={
                  liveSessionEmpty
                    ? `${liveSession.label} has no decisions yet`
                    : undefined
                }
                onClick={() => setConfirmNewSession(true)}
              >
                <Plus size={15} /> New session
              </Button>
            )}
          </div>
        </section>
      )}

      {settings && (
        <section
          id="taste-tools"
          className="settings-panel"
          aria-label="Taste profile and crate tools"
        >
          <div className="settings-title">
            <div>
              <p className="eyebrow">PRIVATE & LOCAL</p>
              <h2>Taste & tools</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close taste and tools"
              onClick={() => setSettings(false)}
            >
              <X size={18} />
            </Button>
          </div>
          <div className="settings-grid">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (await command({ type: 'profile', profile }))
                  setNotice('Taste profile saved locally.');
              }}
            >
              <h3>Taste profile</h3>
              <label className="field-label" htmlFor="taste-brief">
                What works?
              </label>
              <textarea
                id="taste-brief"
                rows={3}
                maxLength={6000}
                value={profile.brief}
                onChange={(e) =>
                  setProfile({ ...profile, brief: e.target.value })
                }
                placeholder="Deep kick, proper bass, physical groove…"
              />
              <label className="field-label" htmlFor="taste-avoid">
                What doesn’t?
              </label>
              <textarea
                id="taste-avoid"
                rows={2}
                maxLength={3000}
                value={profile.avoid}
                onChange={(e) =>
                  setProfile({ ...profile, avoid: e.target.value })
                }
                placeholder="Cheesy vocals, obvious drops, too commercial…"
              />
              <label className="field-label" htmlFor="taste-seeds">
                Reference tracks or library notes
              </label>
              <textarea
                id="taste-seeds"
                rows={4}
                maxLength={18000}
                value={profile.seeds}
                onChange={(e) =>
                  setProfile({ ...profile, seeds: e.target.value })
                }
                placeholder="Artist — title, one per line"
              />
              <Button type="submit" disabled={busy || !state}>
                Save profile
              </Button>
              <p className="field-help">Saved only on this computer.</p>
            </form>
            <div className="crate-tools">
              <div className="tool-section">
                <h3>Next round</h3>
                <p>
                  Give this brief to your agent and ask for as many tracks as
                  you want.
                </p>
                <a
                  className="text-action"
                  href="/api/export?format=next"
                  aria-label="Download brief to ask your agent for more tracks"
                >
                  <ArrowDownToLine size={14} /> Ask your agent for more
                </a>
              </div>
              <div className="tool-section">
                <h3>Import discoveries</h3>
                <label className="file-input-label">
                  <Upload size={15} /> Choose crate JSON
                  <input
                    aria-label="Choose crate JSON"
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => void readImport(e.target.files?.[0])}
                  />
                </label>
                {importCrate && (
                  <div className="import-review">
                    <strong>{importCrate.title}</strong>
                    <p>{importCrate.tracks.length} tracks ready to import.</p>
                    <label className="field-label" htmlFor="import-mode">
                      Import as
                    </label>
                    <select
                      id="import-mode"
                      value={importMode}
                      onChange={(e) =>
                        setImportMode(e.target.value as ImportMode)
                      }
                    >
                      <option value="queue">
                        Up next — keep the current round open
                      </option>
                      <option value="new-crate">
                        New crate — preserve previous tracks and votes
                      </option>
                      <option value="append">Append to current crate</option>
                    </select>
                    <Button disabled={busy} onClick={() => void doImport()}>
                      Import {importCrate.tracks.length} tracks
                    </Button>
                  </div>
                )}
              </div>
              <div className="tool-section">
                <h3>Data & setup</h3>
                <div className="tool-links">
                  <a href="/api/export?format=keepers">Keeper JSON</a>
                  <a href="/api/export?format=crate">Crate JSON</a>
                  <a href="/api/export?format=backup">Private backup</a>
                  <a
                    href="https://github.com/EthanSK/agentic-dj#make-it-your-own"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Setup guide ↗
                  </a>
                </div>
                <p className="field-help">
                  Approve exact files and the final total before any purchase.
                  Players contact their official provider when enabled; music is
                  never copied by this app.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {!state ? (
        <section className="loading-state" aria-live="polite">
          <Disc3 size={30} />
          <h1>{error ? 'Your library is safe.' : 'Opening your crate…'}</h1>
          <p>
            {error
              ? 'Reconnect to the local server to keep listening.'
              : 'Loading saved decisions from this computer.'}
          </p>
        </section>
      ) : (
        <>
          <div className="workspace">
            <section className="audition" aria-label="Listen and decide">
              <div className="deck-top">
                <div className="deck-meta">
                  <div className="deck-position">
                    <span>
                      {track
                        ? `${currentIndex >= 0 ? String(currentIndex + 1).padStart(2, '0') : '—'} / ${tracks.length}`
                        : `${decided} / ${tracks.length}`}
                    </span>
                    <strong>{track?.lane || state.crate.title}</strong>
                  </div>
                  {track && <DiscoveryBadge track={track} />}
                </div>
                {track && (
                  <div className="browse-buttons">
                    <button
                      aria-label="Browse previous track without deciding"
                      disabled={busy || !tracks.length}
                      onClick={() => navigatePlayer(-1)}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      aria-label={
                        previewAudio.phase === 'playing'
                          ? 'Pause preview'
                          : 'Play preview'
                      }
                      disabled={previewAudio.phase === 'loading'}
                      onClick={toggleMainPreview}
                    >
                      {previewAudio.phase === 'playing' ? (
                        <Pause size={17} />
                      ) : (
                        <Play size={17} />
                      )}
                    </button>
                    <button
                      aria-label="Browse next track without deciding"
                      disabled={busy || !tracks.length}
                      onClick={() => navigatePlayer(1)}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}
              </div>
              {track ? (
                <>
                  <div
                    className="record-row swipe-surface"
                    onPointerDown={(e) => {
                      if (e.pointerType === 'touch')
                        swipe.current = { x: e.clientX, y: e.clientY };
                    }}
                    onPointerCancel={() => {
                      swipe.current = null;
                    }}
                    onPointerUp={(e) => {
                      const start = swipe.current;
                      swipe.current = null;
                      if (
                        start &&
                        Math.abs(e.clientX - start.x) > 80 &&
                        Math.abs(e.clientY - start.y) < 60
                      )
                        void decide(e.clientX > start.x ? 'keep' : 'pass');
                    }}
                  >
                    {track.artwork ? (
                      <img
                        key={track.artwork}
                        className="record-art"
                        src={track.artwork}
                        alt={`${track.title} release artwork`}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="record-art art-placeholder">
                        <Disc3 size={70} strokeWidth={1} />
                      </div>
                    )}
                    <div className="record-info">
                      <h1>{track.title}</h1>
                      <p className="artist">{track.artist}</p>
                      <dl className="dj-facts" aria-label="DJ track facts">
                        <div>
                          <dt>BPM</dt>
                          <dd className={!track.bpm ? 'unverified' : ''}>
                            {tempo(track)}
                          </dd>
                        </div>
                        <div>
                          <dt>Key</dt>
                          <dd className={!track.musicalKey ? 'unverified' : ''}>
                            {track.musicalKey || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt>Length</dt>
                          <dd>{duration(track.seconds)}</dd>
                        </div>
                      </dl>
                      <p
                        className="rationale"
                        title="A taste suggestion, not an objective rating"
                      >
                        {track.reason}
                      </p>
                    </div>
                  </div>

                  <div className="player-shell">
                    {playablePreviewId(track.preview) && (
                      <div className="preview-mixer">
                        {previewVolume === 0 ? (
                          <VolumeX size={17} aria-hidden="true" />
                        ) : (
                          <Volume2 size={17} aria-hidden="true" />
                        )}
                        <label htmlFor={`preview-volume-${track.id}`}>
                          Volume
                        </label>
                        <input
                          id={`preview-volume-${track.id}`}
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={previewVolume}
                          onChange={(event) =>
                            changePreviewVolume(Number(event.target.value))
                          }
                        />
                        <output htmlFor={`preview-volume-${track.id}`}>
                          {previewVolume}%
                        </output>
                      </div>
                    )}
                    <div className="player-stage">
                      {playersAllowed && playablePreviewId(track.preview) ? (
                        <PreviewPlayer
                          recordId={track.id}
                          trackId={playablePreviewId(track.preview)!}
                          title={track.title}
                          artist={track.artist}
                          audio={previewAudio}
                        />
                      ) : playablePreviewId(track.preview) ? (
                        <button
                          className="load-player"
                          onClick={() => changePlayersAllowed(true)}
                        >
                          <Headphones size={19} />
                          Enable official preview
                          <span>No autoplay · hardware keys ignored</span>
                        </button>
                      ) : (
                        <div className="no-preview">No preview available.</div>
                      )}
                    </div>
                  </div>

                  <div className="source-row">
                    <a
                      className="source-link"
                      href={musicStoreLink(track).url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {musicStoreLink(track).name} <ArrowUpRight size={14} />
                    </a>
                    <span className="price-label">{money(track)}</span>
                  </div>

                  <div className="decision-row">
                    <Button
                      className="decision pass"
                      disabled={busy}
                      onClick={() => void decide('pass')}
                    >
                      <X /> Pass <kbd>P</kbd>
                    </Button>
                    <Button
                      className="decision later"
                      disabled={busy}
                      onClick={() => void decide('later')}
                    >
                      <SkipForward /> Later <kbd>L</kbd>
                    </Button>
                    <Button
                      className="decision keep"
                      disabled={busy}
                      onClick={() => void decide('keep')}
                    >
                      <Check /> Keep <kbd>K</kbd>
                    </Button>
                  </div>

                  <div className="utility-panels">
                    <details
                      className="feedback-panel"
                      key={`feedback-${track.id}`}
                    >
                      <summary>
                        Feedback
                        {(tags.length || note) && (
                          <span>{tags.length + (note ? 1 : 0)}</span>
                        )}
                      </summary>
                      <div className="feedback-body">
                        <div className="feedback-tags">
                          {feedbackTags.map((tag) => (
                            <button
                              key={tag}
                              className={tags.includes(tag) ? 'selected' : ''}
                              aria-pressed={tags.includes(tag)}
                              onClick={() => {
                                const nextTags = tags.includes(tag)
                                  ? tags.filter((t) => t !== tag)
                                  : [...tags, tag].slice(-4);
                                setDrafts((current) => ({
                                  ...current,
                                  [track.id]: { note, tags: nextTags },
                                }));
                              }}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                        <textarea
                          aria-label="Decision note"
                          value={note}
                          maxLength={800}
                          rows={2}
                          placeholder="Love that bass, but the vocal is too much…"
                          onChange={(e) =>
                            setDrafts((current) => ({
                              ...current,
                              [track.id]: { note: e.target.value, tags },
                            }))
                          }
                        />
                        <p>Saves with your next decision.</p>
                      </div>
                    </details>

                    <details
                      className="track-details"
                      key={`details-${track.id}`}
                    >
                      <summary>
                        <Info size={15} /> Track details
                      </summary>
                      <div className="track-details-body">
                        <dl className="detail-grid">
                          <div>
                            <dt>Genres</dt>
                            <dd>
                              {track.genres?.join(' · ') || 'Not supplied'}
                            </dd>
                          </div>
                          <div>
                            <dt>Listen for</dt>
                            <dd>
                              {track.traits?.join(' · ') || 'Not supplied'}
                            </dd>
                          </div>
                          <div>
                            <dt>Label</dt>
                            <dd>{track.label || 'Not verified'}</dd>
                          </div>
                          <div>
                            <dt>Released</dt>
                            <dd>{released(track.released)}</dd>
                          </div>
                          <div>
                            <dt>Set role</dt>
                            <dd>{track.setRole}</dd>
                          </div>
                          <div>
                            <dt>Accessibility</dt>
                            <dd>{track.accessibility.replace('-', ' ')}</dd>
                          </div>
                        </dl>
                        {track.tempoNote && (
                          <p className="tempo-note">{track.tempoNote}</p>
                        )}
                        {track.caution && (
                          <p className="track-caution">{track.caution}</p>
                        )}
                        <div className="shopping-row">
                          <a
                            href={`https://www.beatport.com/search?q=${encodeURIComponent(`${track.artist} ${track.title}`)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Beatport ↗
                          </a>
                          <a
                            href={`https://www.junodownload.com/search/?q%5Ball%5D%5B%5D=${encodeURIComponent(`${track.artist} ${track.title}`)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Juno ↗
                          </a>
                          <a
                            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${track.artist} ${track.title}`)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            YouTube ↗
                          </a>
                          {playersAllowed && (
                            <button onClick={() => changePlayersAllowed(false)}>
                              Disable preview
                            </button>
                          )}
                        </div>
                        <p className="provenance-note">
                          Source checked{' '}
                          {track.checkedAt
                            ? new Date(track.checkedAt).toLocaleDateString(
                                'en-GB',
                                { dateStyle: 'medium' },
                              )
                            : 'date not recorded'}
                          . Prices can change; verify the exact recording and
                          format at checkout. Search links are not verified
                          offers.
                          {track.suggestedBy
                            ? ` Curation: ${track.suggestedBy}.`
                            : ''}
                        </p>
                      </div>
                    </details>
                  </div>

                  <div className="deck-bottom">
                    <button
                      className="undo-link"
                      onClick={() => void undo()}
                      disabled={busy || !lastDecision}
                    >
                      <RotateCcw size={14} /> Undo <kbd>Z</kbd>
                    </button>
                    <output className="save-notice" aria-live="polite">
                      {busy
                        ? 'Saving…'
                        : notice ||
                          (state.votes[track.id]
                            ? `Marked ${state.votes[track.id].verdict} · saved locally`
                            : 'Decisions save locally')}
                    </output>
                  </div>
                  {playHistory.length > 0 && (
                    <details className="recent-plays">
                      <summary>
                        <History size={13} /> Recent plays
                      </summary>
                      <div>
                        {playHistory.map((entry) => {
                          const played = state.tracks[entry.trackId];
                          return played ? (
                            <button
                              key={entry.trackId}
                              onClick={() => selectTrack(played)}
                            >
                              {played.title}
                              <small>{played.artist}</small>
                            </button>
                          ) : null;
                        })}
                      </div>
                    </details>
                  )}
                </>
              ) : (
                <div className="crate-finished">
                  <Disc3 size={50} strokeWidth={1} />
                  <h1>
                    {roundComplete
                      ? `Round ${round} complete`
                      : 'Pick a record.'}
                  </h1>
                  <p>
                    {roundComplete
                      ? `${counts.keep} keepers · ${counts.pass} passes${counts.later ? ` · ${counts.later} later` : ''}`
                      : 'Choose a track from the queue.'}
                  </p>
                  {roundComplete && (
                    <div className="finished-earprint">
                      <Earprint map={inferredTaste} complete />
                    </div>
                  )}
                  <div>
                    {roundComplete && state.queuedRounds[0] && (
                      <button
                        className="request-next"
                        disabled={busy}
                        onClick={() => void openRound(state.queuedRounds[0])}
                      >
                        <ListMusic size={18} />
                        <span>
                          Open next round
                          <small>
                            {roundName(state.queuedRounds[0])} ·{' '}
                            {
                              state.queuedRounds[0].trackIds.filter(
                                (id) => !state.votes[id],
                              ).length
                            }{' '}
                            to hear
                          </small>
                        </span>
                      </button>
                    )}
                    {roundComplete ? (
                      <a
                        className={`request-next${state.queuedRounds.length ? ' secondary' : ''}`}
                        href="/api/export?format=next"
                        aria-label="Download brief to ask your agent for more tracks"
                      >
                        <ArrowDownToLine size={18} />
                        <span>
                          Ask your agent for more
                          <small>Download brief, then ask for any number</small>
                        </span>
                      </a>
                    ) : (
                      <Button onClick={() => pickView('unheard')}>
                        Show unplayed tracks
                      </Button>
                    )}
                    {roundComplete && (counts.later || counts.keep) ? (
                      <button
                        className="undo-link"
                        onClick={() =>
                          pickView(counts.later ? 'later' : 'keep')
                        }
                      >
                        Review {counts.later ? 'later' : 'keepers'}
                      </button>
                    ) : null}
                    <button
                      className="undo-link"
                      onClick={() => void undo()}
                      disabled={busy || !lastDecision}
                    >
                      <RotateCcw size={14} /> Undo last decision
                    </button>
                  </div>
                </div>
              )}
            </section>

            <aside className="crate-rail" aria-label="Track queue">
              <fieldset className="rail-tabs" aria-label="Filter by decision">
                {(
                  [
                    ['unheard', `To hear ${listCounts.unheard}`],
                    ['keep', `Keep ${keepers.length}`],
                    ['later', `Later ${listCounts.later}`],
                    ['all', 'All'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={view === value ? 'active' : ''}
                    aria-pressed={view === value}
                    onClick={() => pickView(value)}
                  >
                    {label}
                  </button>
                ))}
              </fieldset>
              {viewedScope ? (
                <>
                  <div className="rail-heading">
                    <div>
                      <span>{viewedScope.label}</span>
                      <strong>{sessionDates(viewedScope)}</strong>
                    </div>
                    <b>{viewedScope.keptIds.length} kept</b>
                  </div>
                  <p className="round-description">
                    {roundsText(viewedScope.rounds)}
                  </p>
                  <progress
                    className="crate-progress"
                    value={viewedScope.decided}
                    max={viewedScope.trackIds.length || 1}
                    aria-label={`${viewedScope.decided} of ${viewedScope.trackIds.length} tracks decided`}
                  />
                  <button
                    className="scope-back"
                    onClick={() => viewScope({ kind: 'round' })}
                  >
                    <ChevronLeft size={14} /> Back to {activeRoundName}
                  </button>
                </>
              ) : view === 'unheard' ? (
                <>
                  <div className="rail-heading">
                    <div>
                      <span>Round {round}</span>
                      <strong>{state.crate.title}</strong>
                    </div>
                    <b>
                      {decided}/{tracks.length}
                    </b>
                  </div>
                  <p className="round-description">{state.crate.description}</p>
                  <progress
                    className="crate-progress"
                    value={decided}
                    max={tracks.length}
                    aria-label={`${decided} of ${tracks.length} tracks decided`}
                  />
                  {state.queuedRounds.length > 0 && (
                    <div className="up-next" aria-label="Up next">
                      <span className="up-next-label">Up next</span>
                      {state.queuedRounds.slice(0, 3).map((queued) => {
                        const toHear = queued.trackIds.filter(
                          (id) => !state.votes[id],
                        ).length;
                        return (
                          <div className="up-next-row" key={queued.id}>
                            <div>
                              <small>{roundName(queued)}</small>
                              <strong>{queued.title}</strong>
                              <small>
                                {toHear} to hear · {queued.trackIds.length}{' '}
                                tracks
                              </small>
                            </div>
                            <button
                              disabled={busy}
                              aria-label={`Open ${queued.title}`}
                              title={
                                counts.unheard
                                  ? `${activeRoundName} moves to Up next with ${counts.unheard} to hear`
                                  : undefined
                              }
                              onClick={() => void openRound(queued)}
                            >
                              Open
                            </button>
                          </div>
                        );
                      })}
                      {state.queuedRounds.length > 3 && (
                        <small>
                          {state.queuedRounds.length - 3} more in Up next
                        </small>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="rail-heading">
                  <div>
                    <span>{liveSession?.label || 'This session'}</span>
                    <strong>
                      {view === 'keep'
                        ? 'Kept tracks'
                        : view === 'later'
                          ? 'Saved for later'
                          : 'All tracks'}
                    </strong>
                  </div>
                  <b>{queue.length}</b>
                </div>
              )}

              <div className="queue-tools">
                <button
                  className="queue-filter-toggle"
                  aria-expanded={filtersOpen}
                  aria-controls="queue-filter-body"
                  onClick={() => setFiltersOpen(!filtersOpen)}
                >
                  <ListFilter size={14} /> Filter tracks
                  {(query || lane !== 'all') && <span>Active</span>}
                  <Plus size={13} aria-hidden="true" />
                </button>
                {view === 'keep' && (
                  <select
                    className="keep-sort"
                    aria-label="Sort kept tracks"
                    title="Recommended order is a suggested set, not checked transitions. Date added is when you kept the track."
                    value={keepSort}
                    onChange={(e) => {
                      if (isKeepSort(e.target.value)) {
                        setKeepSort(e.target.value);
                        saveKeepSort(e.target.value);
                      }
                    }}
                  >
                    <option value="recommended">Recommended set order</option>
                    <option value="newest">Date added — newest</option>
                    <option value="oldest">Date added — oldest</option>
                  </select>
                )}
              </div>
              {filtersOpen && (
                <div id="queue-filter-body" className="queue-filter-body">
                  <div className="queue-search">
                    <Search size={14} />
                    <Input
                      aria-label="Search tracks or artists"
                      placeholder="Track or artist"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <select
                    className="lane-filter"
                    aria-label="Filter by musical lane"
                    value={lane}
                    onChange={(e) => setLane(e.target.value)}
                  >
                    <option value="all">All lanes</option>
                    {lanes.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="queue-list">
                {queue.length ? (
                  queue.map((t) => {
                    const verdict = state.votes[t.id]?.verdict;
                    return (
                      <button
                        className={`queue-track ${(view === 'unheard' ? activeId : browsedId) === t.id ? 'selected' : ''} ${verdict ? `verdict-${verdict}` : ''}`}
                        key={t.id}
                        aria-current={activeId === t.id ? 'true' : undefined}
                        title={
                          view === 'keep' && keepSort === 'recommended'
                            ? t.setPlacement?.note
                            : undefined
                        }
                        onClick={() =>
                          view === 'unheard'
                            ? selectTrack(t)
                            : setBrowsedId(t.id)
                        }
                        disabled={busy}
                      >
                        <span>
                          {String(
                            queueTracks.findIndex((x) => x.id === t.id) + 1,
                          ).padStart(2, '0')}
                        </span>
                        {t.artwork ? (
                          <img
                            loading="lazy"
                            src={t.artwork}
                            alt=""
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <Disc3 size={28} />
                        )}
                        <div>
                          <strong>{t.title}</strong>
                          <small className="queue-artist">
                            <span>{t.artist}</span>
                          </small>
                          <DiscoveryBadge track={t} inline />
                        </div>
                        {verdict === 'keep' ? (
                          <Check size={15} aria-label="Kept" />
                        ) : verdict === 'pass' ? (
                          <X size={15} aria-label="Passed" />
                        ) : verdict === 'later' ? (
                          <SkipForward size={15} aria-label="Saved for later" />
                        ) : activeId === t.id ? (
                          <Disc3 size={17} aria-hidden="true" />
                        ) : null}
                      </button>
                    );
                  })
                ) : (
                  <div className="queue-empty">
                    <p>
                      {query || lane !== 'all'
                        ? 'No matches.'
                        : view === 'keep'
                          ? 'No keepers yet.'
                          : view === 'later'
                            ? 'Nothing saved for later.'
                            : 'This view is complete.'}
                    </p>
                    {(query || lane !== 'all') && (
                      <button
                        onClick={() => {
                          setQuery('');
                          setLane('all');
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}
              </div>
              {view !== 'unheard' && queue.length > 0 && (
                <div className="load-selection">
                  <div>
                    {browsedTrack ? (
                      <>
                        <strong>{browsedTrack.title}</strong>
                        <small>{browsedTrack.artist}</small>
                      </>
                    ) : (
                      <span>Select a track</span>
                    )}
                  </div>
                  <Button
                    disabled={!browsedTrack || busy}
                    onClick={() => browsedTrack && selectTrack(browsedTrack)}
                  >
                    Load into player
                  </Button>
                </div>
              )}
              <div
                className="queue-duration"
                aria-live="polite"
                title="Full track lengths, not preview lengths."
              >
                <span>
                  {queueDuration.missing ? 'Known duration' : 'Total duration'}
                </span>
                <strong>{queueDuration.label}</strong>
                <small>
                  {queue.length} tracks
                  {queueDuration.missing
                    ? ` · ${queueDuration.missing} durations missing`
                    : ''}
                </small>
              </div>
              <details className="earprint-card" open>
                <summary>
                  Taste clues · this session{' '}
                  <span>{scopedTaste?.current.decided ?? 0}</span>
                </summary>
                <div className="earprint-body">
                  {scopedTaste && <Earprint map={scopedTaste.current} />}
                </div>
              </details>
              <details className="earprint-card" open>
                <summary>
                  Taste clues · previous sessions{' '}
                  <span>{scopedTaste?.previous.decided ?? 0}</span>
                </summary>
                <div className="earprint-body">
                  {scopedTaste && <Earprint map={scopedTaste.previous} />}
                </div>
              </details>
            </aside>
          </div>

          <footer className="desk-footer">
            <span>Local data · no analytics · no auto-purchases</span>
            <a
              href="https://github.com/EthanSK/agentic-dj"
              target="_blank"
              rel="noreferrer"
            >
              GitHub ↗
            </a>
          </footer>
        </>
      )}
    </main>
  );
}
