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
  RotateCcw,
  Search,
  Settings2,
  SkipForward,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { activeTracks, validateCrate } from '@/lib/domain';
import type { Crate, DeskState, Track, Verdict } from '@/lib/types';

type View = 'unheard' | 'keep' | 'later' | 'all';
const emptyTags: string[] = [];
const feedbackTags = [
  'Dopamine',
  'Great drums',
  'Great bass',
  'Warm / soulful',
  'Too commercial',
  'Too dark',
  'Too repetitive',
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
    : '';
}
function playerUrl(track: Track) {
  if (track.preview?.provider === 'bandcamp')
    return `https://bandcamp.com/EmbeddedPlayer/track=${track.preview.id}/size=small/bgcol=ffffff/linkcol=356df3/transparent=true/`;
  if (track.preview?.provider === 'spotify')
    return `https://open.spotify.com/embed/track/${track.preview.id}?theme=0`;
  return '';
}

export function ListeningDesk() {
  const [state, setState] = useState<DeskState | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>('unheard');
  const [lane, setLane] = useState('all');
  const [query, setQuery] = useState('');
  const [playersAllowed, setPlayersAllowed] = useState(false);
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
  const reviewed = counts.keep + counts.pass;

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
    [track, queue, view, command, note, tags],
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
    <main className="desk-shell">
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="Agentic DJ home">
          <Disc3 size={29} strokeWidth={1.6} />
          <span>
            agentic<span className="wordmark-dj">dj</span>
            <small>GOOD TASTE. YOUR CALL.</small>
          </span>
        </a>
        <span className="local-badge">
          <i /> LOCAL LISTENING DESK
        </span>
        <div className="header-actions">
          <Button
            variant="ghost"
            aria-expanded={settings}
            onClick={() => setSettings(!settings)}
          >
            <Settings2 size={16} />
            <span>Taste & tools</span>
          </Button>
          <a className="export-button" href="/api/export?format=csv">
            <ArrowDownToLine size={15} /> Export keepers{' '}
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
          className="settings-panel"
          aria-label="Taste profile and crate tools"
        >
          <div className="settings-title">
            <div>
              <p className="eyebrow">MAKE IT YOURS</p>
              <h2>Taste is a conversation.</h2>
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
              <label className="field-label" htmlFor="taste-brief">
                What gives you that rush?
              </label>
              <textarea
                id="taste-brief"
                rows={3}
                maxLength={6000}
                value={profile.brief}
                onChange={(e) =>
                  setProfile({ ...profile, brief: e.target.value })
                }
                placeholder="Chopped jungle breaks, warm samples, playful bass…"
              />
              <label className="field-label" htmlFor="taste-avoid">
                What should we skip?
              </label>
              <textarea
                id="taste-avoid"
                rows={2}
                maxLength={3000}
                value={profile.avoid}
                onChange={(e) =>
                  setProfile({ ...profile, avoid: e.target.value })
                }
                placeholder="Radio edits, obvious festival drops, anything too clinical…"
              />
              <label className="field-label" htmlFor="taste-seeds">
                Reference tracks / library notes
              </label>
              <textarea
                id="taste-seeds"
                rows={4}
                maxLength={18000}
                value={profile.seeds}
                onChange={(e) =>
                  setProfile({ ...profile, seeds: e.target.value })
                }
                placeholder="Artist — title, one per line. Add notes from your own playlists."
              />
              <Button type="submit" disabled={busy || !state}>
                Save private profile
              </Button>
              <p className="field-help">
                Stored on this computer. Saving does not send it to any AI
                service.
              </p>
            </form>
            <div className="crate-tools">
              <h3>1. Brief your agent</h3>
              <p>
                Export your saved taste profile and decisions. Give it to your
                preferred assistant to research the next crate. It can inspect
                your own music exports with your permission.
              </p>
              <a className="text-action" href="/api/export?format=brief">
                <ArrowDownToLine size={14} /> Download private agent brief
              </a>
              <h3>2. Bring back discoveries</h3>
              <p>
                Import the assistant’s verified crate JSON. No API key or
                streaming account is required by Agentic DJ.
              </p>
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
                  <p>
                    {importCrate.tracks.length} tracks validated. No data has
                    changed yet.
                  </p>
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
                      New active crate — keep previous tracks and votes
                    </option>
                    <option value="append">Append to the current crate</option>
                  </select>
                  <Button disabled={busy} onClick={() => void doImport()}>
                    Import {importCrate.tracks.length} tracks
                  </Button>
                </div>
              )}
              <h3>3. Approve a shortlist, not a surprise charge</h3>
              <p>
                Export keepers for a store-by-store comparison. Approve the
                exact recordings, file formats and final total before your
                assistant buys anything.
              </p>
              <div className="tool-links">
                <a href="/api/export?format=keepers">Keeper JSON</a>
                <a href="/api/export?format=crate">Current crate JSON</a>
                <a href="/api/export?format=backup">Private data backup</a>
                <a
                  href="https://github.com/EthanSK/agentic-dj#make-it-your-own"
                  target="_blank"
                  rel="noreferrer"
                >
                  Setup & agent guide ↗
                </a>
              </div>
              <p className="field-help">
                Official players contact their provider when enabled. Artwork
                loads from the record’s original host. Music is never copied or
                downloaded by this app.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="crate-heading">
        <div>
          <p className="eyebrow">
            {state
              ? `${String(tracks.length).padStart(2, '0')} TRACKS / ${state.crate.title.toUpperCase()}`
              : 'YOUR LOCAL LISTENING DESK'}
          </p>
          <h1>
            Find your next
            <br />
            <em>“what is this?”</em>
          </h1>
        </div>
        <p className="crate-intro">
          {state?.crate.description || 'Good records. Open ears. Your call.'}
          <span>Listen. Trust your gut. Keep the good ones.</span>
        </p>
      </section>

      {!state ? (
        <section className="loading-state" aria-live="polite">
          <Disc3 size={30} />
          <h2>
            {error ? 'Your library is safe on disk.' : 'Opening your crate…'}
          </h2>
          <p>
            {error
              ? 'Reconnect to the local server to keep listening.'
              : 'Loading saved decisions from this computer.'}
          </p>
        </section>
      ) : (
        <div className="workspace">
          <section className="audition" aria-label="Listen and decide">
            <div className="deck-top">
              <span className="eyebrow">
                {track ? 'ON THE DECK' : 'ROOM TO BREATHE'}
              </span>
              <span className="counter">
                {track
                  ? `${String(currentIndex + 1).padStart(2, '0')} / ${tracks.length}`
                  : `${reviewed} DECIDED`}
              </span>
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
                    <span className="lane">{track.lane.toUpperCase()}</span>
                    <h2>{track.title}</h2>
                    <p className="artist">{track.artist}</p>
                    <p
                      className="rationale"
                      title="A taste suggestion, not an objective rating"
                    >
                      {track.reason}
                    </p>
                    <div className="track-facts">
                      <span>
                        {track.accessibility.replace('-', ' ').toUpperCase()}
                      </span>
                      {track.seconds && <span>{duration(track.seconds)}</span>}
                      {track.bpm && <span>{track.bpm} BPM</span>}
                      <span>{track.setRole}</span>
                    </div>
                  </div>
                </div>
                <div className="player-shell" key={track.id}>
                  {playersAllowed && track.preview ? (
                    <iframe
                      key={track.id}
                      title={`${track.title} by ${track.artist} — official ${track.preview.provider} player`}
                      src={playerUrl(track)}
                      height={track.preview.provider === 'spotify' ? 152 : 42}
                      loading="eager"
                      allow="autoplay; encrypted-media"
                      referrerPolicy="no-referrer"
                    />
                  ) : track.preview ? (
                    <button
                      className="load-player"
                      onClick={() => setPlayersAllowed(true)}
                    >
                      <Headphones size={19} /> Enable official players{' '}
                      <span>No autoplay</span>
                    </button>
                  ) : (
                    <div className="no-preview">
                      No embedded preview available. Open the source below to
                      listen.
                    </div>
                  )}
                </div>
                <div className="source-row">
                  <a
                    className="source-link"
                    href={track.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Listen / download on {track.sourceName}{' '}
                    <ArrowUpRight size={14} />
                  </a>
                  <span className="price-label">
                    {money(track)}
                    <small>
                      {track.price
                        ? 'Before tax · not yet price-compared'
                        : 'No verified price saved'}
                    </small>
                  </span>
                </div>
                {track.caution && (
                  <p className="track-caution">{track.caution}</p>
                )}
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
                <details className="feedback-panel">
                  <summary>
                    Tell the next crate why <span>optional</span>
                  </summary>
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
                  <p>
                    Tags and notes save when you choose Keep, Pass or Later.
                  </p>
                </details>
                <div className="deck-bottom">
                  <button
                    className="undo-link"
                    onClick={() => void undo()}
                    disabled={busy || !lastDecision}
                  >
                    <RotateCcw size={13} /> Undo <kbd>Z</kbd>
                  </button>
                  <span className="keyboard-hint">
                    Swipe artwork or use arrow keys outside the player.
                  </span>
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
                </div>
                <details className="provenance">
                  <summary>Source & shopping details</summary>
                  <p>
                    Source checked{' '}
                    {track.checkedAt
                      ? new Date(track.checkedAt).toLocaleDateString('en-GB', {
                          dateStyle: 'medium',
                        })
                      : 'date not recorded'}
                    . Prices can change; compare the exact recording and format
                    at checkout. Musical fit and set role are suggestions, not
                    measured ratings.
                  </p>
                  <div>
                    <a
                      href={`https://www.beatport.com/search?q=${encodeURIComponent(`${track.artist} ${track.title}`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Search Beatport ↗
                    </a>
                    <a
                      href={`https://www.junodownload.com/search/?q%5Ball%5D%5B%5D=${encodeURIComponent(`${track.artist} ${track.title}`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Search Juno Download ↗
                    </a>
                    {playersAllowed && (
                      <button onClick={() => setPlayersAllowed(false)}>
                        Disable embedded players
                      </button>
                    )}
                  </div>
                  <p>
                    Search links are discovery tools, not verified offers.{' '}
                    {track.suggestedBy ? `Curation: ${track.suggestedBy}.` : ''}
                  </p>
                </details>
              </>
            ) : (
              <div className="crate-finished">
                <Disc3 size={58} strokeWidth={1} />
                <h2>
                  {counts.unheard === 0 ? 'That’s a crate.' : 'Pick a record.'}
                </h2>
                <p>
                  {counts.unheard === 0
                    ? `${counts.keep} keepers, ${counts.pass} passes${counts.later ? ` and ${counts.later} to revisit` : ''}. Your decisions are saved on this computer.`
                    : 'Select a track from the queue, or switch to a different view.'}
                </p>
                <div>
                  <Button
                    onClick={() =>
                      pickView(
                        counts.unheard
                          ? 'unheard'
                          : counts.later
                            ? 'later'
                            : 'keep',
                      )
                    }
                  >
                    {counts.unheard
                      ? 'Hear the unplayed tracks'
                      : counts.later
                        ? 'Revisit the maybes'
                        : 'Review keepers'}
                  </Button>
                  <button
                    className="undo-link"
                    onClick={() => void undo()}
                    disabled={busy || !lastDecision}
                  >
                    <RotateCcw size={14} /> Undo last decision
                  </button>
                </div>
                <p className="quiet-note">Nothing has been purchased.</p>
              </div>
            )}
            <output className="save-notice" aria-live="polite">
              {busy
                ? 'Saving to this computer…'
                : notice ||
                  (track && state.votes[track.id]
                    ? `Previously marked ${state.votes[track.id].verdict}. Choose again to change it.`
                    : 'Your ears get the final say. No purchases happen here.')}
            </output>
          </section>

          <aside className="crate-rail" aria-label="Track queue">
            <p className="eyebrow">YOUR CRATE</p>
            <div className="rail-count">
              {String(reviewed).padStart(2, '0')}
              <span>/ {tracks.length} decided</span>
            </div>
            <progress
              className="crate-progress"
              value={reviewed}
              max={tracks.length}
              aria-label={`${reviewed} of ${tracks.length} tracks decided`}
            />
            <div className="crate-stats">
              <span>{counts.keep} kept</span>
              <span>{counts.pass} passed</span>
              <span>{counts.later} later</span>
            </div>
            <fieldset className="rail-tabs" aria-label="Filter by decision">
              {(
                [
                  ['unheard', 'To hear'],
                  ['keep', 'Keepers'],
                  ['later', 'Later'],
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
            <div className="queue-search">
              <Search size={14} />
              <Input
                aria-label="Search tracks or artists"
                placeholder="Find a track or artist"
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
            <div className="queue-list">
              {queue.length ? (
                queue.map((t) => (
                  <button
                    className={`queue-track ${activeId === t.id ? 'selected' : ''}`}
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
                    {state.votes[t.id]?.verdict === 'keep' ? (
                      <Check size={15} />
                    ) : activeId === t.id ? (
                      <Disc3 size={17} />
                    ) : null}
                  </button>
                ))
              ) : (
                <div className="queue-empty">
                  <p>
                    {query || lane !== 'all'
                      ? 'No matches in this view.'
                      : view === 'keep'
                        ? 'Keep something you love. It’ll appear here.'
                        : view === 'later'
                          ? 'Nothing set aside for later.'
                          : 'You’ve heard everything in this view.'}
                  </p>
                  {(query || lane !== 'all') && (
                    <button
                      onClick={() => {
                        setQuery('');
                        setLane('all');
                      }}
                    >
                      Clear search and lane
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="rail-note">
              <Headphones size={22} />
              <h3>Keep the feeling. Skip the filler.</h3>
              <p>
                Keeping a track builds a shortlist. Your assistant can
                price-check it when you’re ready. It never buys anything
                automatically.
              </p>
            </div>
          </aside>
        </div>
      )}
      <footer className="desk-footer">
        <span>HUMAN TASTE × AGENT-ASSISTED DIGGING</span>
        <a
          href="https://github.com/EthanSK/agentic-dj"
          target="_blank"
          rel="noreferrer"
        >
          Open source · Agentic DJ ↗
        </a>
        <span>Local data. No analytics. No auto-purchases.</span>
      </footer>
    </main>
  );
}
