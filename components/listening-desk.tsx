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
  Info,
  ListFilter,
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
import { activeTracks, tasteMap, validateCrate } from '@/lib/domain';
import {
  DEFAULT_PREVIEW_VOLUME,
  normalisePreviewVolume,
  playerUrl,
} from '@/lib/player';
import {
  blockHardwareMediaKeys,
  EMBEDDED_PLAYER_ALLOW,
} from '@/lib/media-keys';
import type { Crate, DeskState, TasteMap, Track, Verdict } from '@/lib/types';

type View = 'unheard' | 'keep' | 'later' | 'all';
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

function Earprint({
  map,
  complete = false,
}: {
  map: TasteMap;
  complete?: boolean;
}) {
  if (!map.decided)
    return (
      <div className="earprint-empty">
        <strong>No genre homework.</strong>
        <p>
          Make a few decisions. This space will show what the records you keep
          and pass have in common.
        </p>
      </div>
    );
  return (
    <div className="earprint-map">
      <p className="earprint-status">
        {complete
          ? 'Round decoded from your answers'
          : map.decided < 3
            ? 'Very early clues — keep listening'
            : 'Provisional clues from your ears'}
      </p>
      <div className="signal-group positive">
        <span>More like</span>
        <div>
          {map.positive.length ? (
            map.positive.map((signal) => (
              <i key={`${signal.kind}-${signal.label}`}>{signal.label}</i>
            ))
          ) : (
            <small>No positive pattern yet</small>
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
            <small>No negative pattern yet</small>
          )}
        </div>
      </div>
      <p className="earprint-footnote">
        These are working clues, not permanent genre boxes.
      </p>
    </div>
  );
}

export function ListeningDesk() {
  const [state, setState] = useState<DeskState | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>('unheard');
  const [lane, setLane] = useState('all');
  const [query, setQuery] = useState('');
  const [playersAllowed, setPlayersAllowed] = useState(false);
  const [previewVolume, setPreviewVolume] = useState(DEFAULT_PREVIEW_VOLUME);
  const [playerVolume, setPlayerVolume] = useState(DEFAULT_PREVIEW_VOLUME);
  const volumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState(false);
  const [drafts, setDrafts] = useState<
    Record<string, { note: string; tags: string[] }>
  >({});
  const [profile, setProfile] = useState({ brief: '', avoid: '', seeds: '' });
  const [importCrate, setImportCrate] = useState<Crate | null>(null);
  const [importMode, setImportMode] = useState<'append' | 'new-crate'>(
    'new-crate',
  );
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const load = useCallback(async (initial = false) => {
    try {
      const response = await fetch('/api/state', { cache: 'no-store' });
      if (!response.ok)
        throw new Error(
          'Could not load your local library. Check that Agentic DJ is running, then retry.',
        );
      const next: DeskState = await response.json();
      setState(next);
      setError('');
      if (initial) {
        setProfile(next.profile);
        setActiveId(next.crate.trackIds.find((id) => !next.votes[id]) || null);
      }
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
  useEffect(
    () => () => {
      if (volumeTimer.current) clearTimeout(volumeTimer.current);
    },
    [],
  );
  useEffect(() => {
    const shield = blockHardwareMediaKeys(navigator.mediaSession);
    document.documentElement.dataset.mediaKeyShield =
      shield.blockedActions.join(',') || 'unsupported';
    return () => {
      shield.release();
      delete document.documentElement.dataset.mediaKeyShield;
    };
  }, []);

  const changePreviewVolume = (value: number) => {
    const next = normalisePreviewVolume(value);
    setPreviewVolume(next);
    if (volumeTimer.current) clearTimeout(volumeTimer.current);
    volumeTimer.current = setTimeout(() => {
      setPlayerVolume(next);
      volumeTimer.current = null;
    }, 250);
  };

  const tracks = useMemo(() => (state ? activeTracks(state) : []), [state]);
  const lanes = useMemo(
    () => [...new Set(tracks.map((t) => t.lane))],
    [tracks],
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
  const inferredTaste = useMemo(
    () =>
      state ? tasteMap(state) : { decided: 0, positive: [], negative: [] },
    [state],
  );
  const queue = useMemo(
    () =>
      tracks.filter((t) => {
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
    [tracks, state, view, lane, query],
  );
  const track = activeId ? state?.tracks[activeId] : null;
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
      const oldIndex = queue.findIndex((t) => t.id === track.id);
      const next = await command({
        type: 'vote',
        trackId: track.id,
        verdict,
        note,
        tags,
      });
      if (!next) return;
      setDrafts((current) => {
        const updated = { ...current };
        delete updated[track.id];
        return updated;
      });
      setNotice(
        `${verdict === 'keep' ? 'Kept' : verdict === 'pass' ? 'Passed' : 'Saved for later'} ${track.title} · saved locally.`,
      );
      if (tracks.every((candidate) => next.votes[candidate.id])) {
        setView('unheard');
        setLane('all');
        setQuery('');
        setActiveId(null);
        return;
      }
      const remaining = queue.filter(
        (t) =>
          t.id !== track.id &&
          (view === 'all' ||
            (view === 'unheard'
              ? !next.votes[t.id]
              : next.votes[t.id]?.verdict === view)),
      );
      setActiveId(
        remaining[Math.min(Math.max(0, oldIndex), remaining.length - 1)]?.id ||
          null,
      );
    },
    [track, tracks, queue, view, command, note, tags],
  );

  const undo = useCallback(async () => {
    if (!lastDecision) return;
    const next = await command({ type: 'undo', eventId: lastDecision.id });
    if (next) {
      setActiveId(lastDecision.trackId);
      setView('all');
      setLane('all');
      setQuery('');
      setNotice('Last decision undone · saved locally.');
    }
  }, [lastDecision, command]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement;
      if (
        event.repeat ||
        busyRef.current ||
        settings ||
        el.closest(
          'input, textarea, select, button, a, [contenteditable="true"]',
        ) ||
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
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        void decide('pass');
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        void decide('keep');
      }
      if (event.key === 'ArrowDown') {
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
  }, [decide, undo, settings]);

  function pickView(nextView: View) {
    setView(nextView);
    setQuery('');
    setLane('all');
    setActiveId(
      tracks.find(
        (t) =>
          nextView === 'all' ||
          (nextView === 'unheard'
            ? !state?.votes[t.id]
            : state?.votes[t.id]?.verdict === nextView),
      )?.id || null,
    );
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
      setView('unheard');
      setLane('all');
      setQuery('');
      setActiveId(next.crate.trackIds.find((id) => !next.votes[id]) || null);
      setNotice(
        'Crate imported. Existing decisions and previous tracks are preserved locally.',
      );
    }
  }

  return (
    <main className="desk-shell" data-media-keys="ignored">
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="Agentic DJ home">
          <Disc3 size={25} strokeWidth={1.7} />
          <span>
            agentic<span className="wordmark-dj">dj</span>
          </span>
        </a>
        <div className="crate-context" aria-label="Current crate progress">
          <span className="local-badge">
            <i /> Local
          </span>
          {state && (
            <>
              <strong>Round {round}</strong>
              <span>
                {decided}/{tracks.length}
              </span>
            </>
          )}
        </div>
        <div className="header-actions">
          <Button
            variant="ghost"
            aria-expanded={settings}
            aria-controls="taste-tools"
            onClick={() => setSettings(!settings)}
          >
            <Settings2 size={16} />
            <span>Tools</span>
          </Button>
          <a className="export-button" href="/api/export?format=csv">
            <ArrowDownToLine size={15} /> Keepers CSV
            <span>{counts.keep}</span>
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
                <p>Export your decisions and taste clues for ten new tracks.</p>
                <a className="text-action" href="/api/export?format=next">
                  <ArrowDownToLine size={14} /> Prepare agent request
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
                        setImportMode(e.target.value as 'append' | 'new-crate')
                      }
                    >
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
                <div className="deck-position">
                  <span>
                    {track
                      ? `${String(currentIndex + 1).padStart(2, '0')} / ${tracks.length}`
                      : `${decided} / ${tracks.length}`}
                  </span>
                  <strong>{track?.lane || state.crate.title}</strong>
                </div>
                {track && (
                  <div className="browse-buttons">
                    <button
                      aria-label="Browse previous track without deciding"
                      disabled={busy || !queue.length}
                      onClick={() => {
                        const i = queue.findIndex((t) => t.id === track.id);
                        setActiveId(
                          queue[(i - 1 + queue.length) % queue.length]?.id ||
                            null,
                        );
                      }}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      aria-label="Browse next track without deciding"
                      disabled={busy || !queue.length}
                      onClick={() => {
                        const i = queue.findIndex((t) => t.id === track.id);
                        setActiveId(queue[(i + 1) % queue.length]?.id || null);
                      }}
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
                      <span className="lane">{track.lane}</span>
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

                  <div className="player-shell" key={track.id}>
                    {track.preview?.provider === 'bandcamp' && (
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
                        <small aria-live="polite">
                          {previewVolume !== playerVolume
                            ? 'Applying…'
                            : playerVolume === 0
                              ? 'Muted — raise the level to reload'
                              : playersAllowed
                                ? 'Reloads the player when changed'
                                : 'Starts quiet'}
                        </small>
                      </div>
                    )}
                    <div className="player-stage">
                      {playersAllowed && track.preview ? (
                        track.preview.provider === 'bandcamp' &&
                        playerVolume === 0 ? (
                          <div className="no-preview">
                            Preview muted. Raise the volume to reload it.
                          </div>
                        ) : (
                          <iframe
                            key={`${track.id}-${playerVolume}`}
                            title={`${track.title} by ${track.artist} — official ${track.preview.provider} player`}
                            src={playerUrl(track, playerVolume)}
                            height={
                              track.preview.provider === 'spotify' ? 152 : 120
                            }
                            loading="eager"
                            allow={EMBEDDED_PLAYER_ALLOW}
                            referrerPolicy="no-referrer"
                          />
                        )
                      ) : track.preview ? (
                        <button
                          className="load-player"
                          onClick={() => setPlayersAllowed(true)}
                        >
                          <Headphones size={19} /> Enable official preview
                          <span>No autoplay · starts at 25%</span>
                        </button>
                      ) : (
                        <div className="no-preview">
                          No embedded preview. Use the source link below.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="source-row">
                    <a
                      className="source-link"
                      href={track.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {track.sourceName} <ArrowUpRight size={14} />
                    </a>
                    <span className="price-label">{money(track)}</span>
                  </div>

                  <div className="decision-row">
                    <Button
                      className="decision pass"
                      disabled={busy}
                      onClick={() => void decide('pass')}
                    >
                      <X /> Pass <kbd>←</kbd>
                    </Button>
                    <Button
                      className="decision later"
                      disabled={busy}
                      onClick={() => void decide('later')}
                    >
                      <SkipForward /> Later <kbd>↓</kbd>
                    </Button>
                    <Button
                      className="decision keep"
                      disabled={busy}
                      onClick={() => void decide('keep')}
                    >
                      <Check /> Keep <kbd>→</kbd>
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
                            <button onClick={() => setPlayersAllowed(false)}>
                              Disable players
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
                </>
              ) : (
                <div className="crate-finished">
                  <Disc3 size={50} strokeWidth={1} />
                  <h1>
                    {roundComplete
                      ? `Round ${round} decoded.`
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
                    {roundComplete ? (
                      <a
                        className="request-next"
                        href="/api/export?format=next"
                        onClick={() =>
                          setNotice(
                            'Next-round request prepared from your answers.',
                          )
                        }
                      >
                        <ArrowDownToLine size={18} />
                        <span>
                          Request 10 more
                          <small>Uses every answer</small>
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
                  <p className="quiet-note">
                    Saved locally · nothing purchased
                  </p>
                </div>
              )}
            </section>

            <aside className="crate-rail" aria-label="Track queue">
              <div className="rail-heading">
                <div>
                  <span>Round {round}</span>
                  <strong>{state.crate.title}</strong>
                </div>
                <b>
                  {decided}/{tracks.length}
                </b>
              </div>
              <progress
                className="crate-progress"
                value={decided}
                max={tracks.length}
                aria-label={`${decided} of ${tracks.length} tracks decided`}
              />
              <fieldset className="rail-tabs" aria-label="Filter by decision">
                {(
                  [
                    ['unheard', `To hear ${counts.unheard}`],
                    ['keep', `Keep ${counts.keep}`],
                    ['later', `Later ${counts.later}`],
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
              <details
                className="queue-filters"
                open={query || lane !== 'all' ? true : undefined}
              >
                <summary>
                  <ListFilter size={14} /> Filter tracks
                  {(query || lane !== 'all') && <span>Active</span>}
                </summary>
                <div className="queue-filter-body">
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
              </details>
              <div className="queue-list">
                {queue.length ? (
                  queue.map((t) => {
                    const verdict = state.votes[t.id]?.verdict;
                    return (
                      <button
                        className={`queue-track ${activeId === t.id ? 'selected' : ''} ${verdict ? `verdict-${verdict}` : ''}`}
                        key={t.id}
                        aria-current={activeId === t.id ? 'true' : undefined}
                        onClick={() => setActiveId(t.id)}
                        disabled={busy}
                      >
                        <span>
                          {String(
                            tracks.findIndex((x) => x.id === t.id) + 1,
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
                          <small>{t.artist}</small>
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
              <details className="earprint-card">
                <summary>
                  Taste clues <span>{inferredTaste.decided}</span>
                </summary>
                <div className="earprint-body">
                  <Earprint map={inferredTaste} complete={roundComplete} />
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
