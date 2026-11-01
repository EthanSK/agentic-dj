'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, Pause, Play } from 'lucide-react';
import { previewAudioUrl, previewProviderName } from '@/lib/preview-source';
import { rememberPlayedTrack } from '@/lib/listening-memory';

type Phase = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';

export type PreviewTrack = {
  trackId: string;
  recordId?: string;
  title: string;
  artist: string;
};

const MAX_DECODED_PREVIEWS = 3;

function clock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function usePreviewAudio({
  enabled,
  volume,
}: {
  enabled: boolean;
  volume: number;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [activeTrack, setActiveTrack] = useState<PreviewTrack | null>(null);
  const [bufferedTrackIds, setBufferedTrackIds] = useState<string[]>([]);
  const contextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const buffersRef = useRef(new Map<string, AudioBuffer>());
  const pendingRef = useRef(new Map<string, Promise<AudioBuffer>>());
  const controllersRef = useRef(new Map<string, AbortController>());
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activeTrackRef = useRef<PreviewTrack | null>(null);
  const playingRef = useRef(false);
  const playbackRequestRef = useRef(0);
  const offsetRef = useRef(0);
  const startedAtRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const volumeRef = useRef(volume);

  const cancelFrame = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const stopSource = useCallback(() => {
    const source = sourceRef.current;
    sourceRef.current = null;
    if (!source) return;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // A source that has already ended needs no further cleanup.
    }
    source.disconnect();
  }, []);

  const ensureContext = useCallback(() => {
    let context = contextRef.current;
    if (context) return context;
    context = new AudioContext();
    const gain = context.createGain();
    gain.gain.value = volumeRef.current / 100;
    gain.connect(context.destination);
    contextRef.current = context;
    gainRef.current = gain;
    return context;
  }, []);

  const currentPosition = useCallback(() => {
    const context = contextRef.current;
    const buffer = bufferRef.current;
    if (!context || !buffer || !playingRef.current) return offsetRef.current;
    return Math.min(
      buffer.duration,
      offsetRef.current + context.currentTime - startedAtRef.current,
    );
  }, []);

  const startClock = useCallback(() => {
    cancelFrame();
    const tick = () => {
      if (!playingRef.current || !mountedRef.current) return;
      setPosition(currentPosition());
      frameRef.current = requestAnimationFrame(tick); // oxlint-disable-line react/react-compiler -- The animation callback intentionally reschedules itself.
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [cancelFrame, currentPosition]);

  const startPlayback = useCallback(() => {
    const context = contextRef.current;
    const gain = gainRef.current;
    const buffer = bufferRef.current;
    if (!context || !gain || !buffer) return;

    stopSource();
    if (offsetRef.current >= buffer.duration - 0.05) offsetRef.current = 0;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.onended = () => {
      if (sourceRef.current !== source) return;
      sourceRef.current = null;
      playingRef.current = false;
      offsetRef.current = buffer.duration;
      cancelFrame();
      if (mountedRef.current) {
        setPosition(buffer.duration);
        setPhase('ready');
      }
    };
    startedAtRef.current = context.currentTime;
    sourceRef.current = source;
    playingRef.current = true;
    source.start(0, offsetRef.current);
    if (activeTrackRef.current?.recordId)
      rememberPlayedTrack(activeTrackRef.current.recordId);
    setPosition(offsetRef.current);
    setPhase('playing');
    startClock();
  }, [cancelFrame, startClock, stopSource]);

  const trimBuffers = useCallback((newestTrackId: string) => {
    while (buffersRef.current.size > MAX_DECODED_PREVIEWS) {
      const activeTrackId = activeTrackRef.current?.trackId;
      const removable = [...buffersRef.current.keys()].find(
        (id) => id !== activeTrackId && id !== newestTrackId,
      );
      if (!removable) return;
      buffersRef.current.delete(removable);
    }
  }, []);

  const loadAudio = useCallback(
    async (trackId: string): Promise<AudioBuffer> => {
      const cached = buffersRef.current.get(trackId);
      if (cached) {
        buffersRef.current.delete(trackId);
        buffersRef.current.set(trackId, cached);
        return cached;
      }
      const pending = pendingRef.current.get(trackId);
      if (pending) return pending;

      const context = ensureContext();
      const controller = new AbortController();
      controllersRef.current.set(trackId, controller);
      const request = (async () => {
        const response = await fetch(previewAudioUrl(trackId), {
          cache: 'no-store',
          signal: controller.signal,
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        });
        if (!response.ok) {
          const problem = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(problem?.error || 'Could not load this preview.');
        }
        const bytes = await response.arrayBuffer();
        const buffer = await context.decodeAudioData(bytes);
        if (!mountedRef.current) throw new Error('Preview closed.');
        buffersRef.current.set(trackId, buffer);
        trimBuffers(trackId);
        setBufferedTrackIds([...buffersRef.current.keys()]);
        return buffer;
      })();
      pendingRef.current.set(trackId, request);
      try {
        return await request;
      } finally {
        pendingRef.current.delete(trackId);
        controllersRef.current.delete(trackId);
      }
    },
    [ensureContext, trimBuffers],
  );

  const preload = useCallback(
    async (trackId?: string) => {
      if (!enabled || !trackId) return;
      try {
        await loadAudio(trackId);
      } catch {
        // Preloading is opportunistic; foreground playback reports failures.
      }
    },
    [enabled, loadAudio],
  );

  const pause = useCallback(() => {
    if (!playingRef.current) return;
    const next = currentPosition();
    playingRef.current = false;
    offsetRef.current = next;
    stopSource();
    cancelFrame();
    setPosition(next);
    setPhase('paused');
  }, [cancelFrame, currentPosition, stopSource]);

  const stop = useCallback(() => {
    const wasPlaying = playingRef.current;
    playbackRequestRef.current += 1;
    playingRef.current = false;
    stopSource();
    cancelFrame();
    bufferRef.current = null;
    activeTrackRef.current = null;
    offsetRef.current = 0;
    setPosition(0);
    setDuration(0);
    setError('');
    setActiveTrack(null);
    setPhase('idle');
    return wasPlaying;
  }, [cancelFrame, stopSource]);

  const play = useCallback(
    async (track: PreviewTrack) => {
      if (!enabled) return;
      const sameTrack = activeTrackRef.current?.trackId === track.trackId;
      if (sameTrack && playingRef.current) return;
      if (!sameTrack) stop();

      const request = ++playbackRequestRef.current;
      setPhase('loading');
      setError('');
      try {
        const context = ensureContext();
        await context.resume();
        if (!mountedRef.current || request !== playbackRequestRef.current)
          return;
        let buffer = bufferRef.current;
        if (activeTrackRef.current?.trackId !== track.trackId || !buffer) {
          setPhase('loading');
          setError('');
          buffer = await loadAudio(track.trackId);
          if (!mountedRef.current || request !== playbackRequestRef.current)
            return;
          activeTrackRef.current = track;
          setActiveTrack(track);
          bufferRef.current = buffer;
          offsetRef.current = 0;
          setPosition(0);
          setDuration(buffer.duration);
          setPhase('ready');
        }
        startPlayback();
      } catch (caught) {
        if (!mountedRef.current || request !== playbackRequestRef.current)
          return;
        if (caught instanceof DOMException && caught.name === 'AbortError')
          return;
        const message =
          caught instanceof Error
            ? caught.message
            : 'Could not load this preview.';
        setError(message);
        setPhase('error');
      }
    },
    [enabled, ensureContext, loadAudio, startPlayback, stop],
  );

  const toggle = useCallback(
    async (track: PreviewTrack) => {
      if (
        playingRef.current &&
        activeTrackRef.current?.trackId === track.trackId
      ) {
        pause();
        return;
      }
      await play(track);
    },
    [pause, play],
  );

  const seek = useCallback(
    (next: number) => {
      const buffer = bufferRef.current;
      if (!buffer) return;
      const target = Math.min(buffer.duration, Math.max(0, next));
      const wasPlaying = playingRef.current;
      playingRef.current = false;
      stopSource();
      cancelFrame();
      offsetRef.current = target;
      setPosition(target);
      if (wasPlaying) startPlayback();
      else setPhase(target ? 'paused' : 'ready');
    },
    [cancelFrame, startPlayback, stopSource],
  );

  const shutdown = useCallback(
    (updateState: boolean) => {
      playbackRequestRef.current += 1;
      for (const controller of controllersRef.current.values())
        controller.abort();
      controllersRef.current.clear();
      pendingRef.current.clear();
      playingRef.current = false;
      stopSource();
      cancelFrame();
      const context = contextRef.current;
      contextRef.current = null;
      gainRef.current = null;
      bufferRef.current = null;
      buffersRef.current.clear();
      activeTrackRef.current = null;
      offsetRef.current = 0;
      if (context && context.state !== 'closed')
        void context.close().catch(() => undefined);
      if (updateState && mountedRef.current) {
        setPhase('idle');
        setPosition(0);
        setDuration(0);
        setError('');
        setActiveTrack(null);
        setBufferedTrackIds([]);
      }
    },
    [cancelFrame, stopSource],
  );

  useEffect(() => {
    volumeRef.current = volume;
    const gain = gainRef.current;
    const context = contextRef.current;
    if (gain && context)
      gain.gain.setTargetAtTime(volume / 100, context.currentTime, 0.015);
  }, [volume]);

  useEffect(() => {
    if (!enabled) shutdown(true);
  }, [enabled, shutdown]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      shutdown(false);
    };
  }, [shutdown]);

  return {
    activeTrack,
    bufferedTrackIds,
    duration,
    error,
    phase,
    position,
    play,
    preload,
    seek,
    stop,
    toggle,
  };
}

export function PreviewPlayer({
  trackId,
  recordId,
  title,
  artist,
  audio,
}: PreviewTrack & {
  audio: ReturnType<typeof usePreviewAudio>;
}) {
  const loading = audio.phase === 'loading';
  const controlledTrack = audio.activeTrack;
  const browsingAnotherTrack = controlledTrack?.trackId !== trackId;
  const playing = audio.phase === 'playing' && !browsingAnotherTrack;
  return (
    <div
      className="web-audio-player"
      data-preview-engine="web-audio"
      data-preview-phase={audio.phase}
      data-track-id={trackId}
      data-active-track-id={controlledTrack?.trackId}
      data-buffered-track-ids={audio.bufferedTrackIds.join(',')}
    >
      <button
        className="preview-toggle"
        onClick={() => void audio.toggle({ trackId, recordId, title, artist })}
        disabled={loading}
        aria-label={`${playing ? 'Pause' : 'Play'} ${title} by ${artist}`}
      >
        {loading ? (
          <LoaderCircle className="preview-spinner" size={18} />
        ) : playing ? (
          <Pause size={18} fill="currentColor" />
        ) : (
          <Play size={18} fill="currentColor" />
        )}
      </button>
      <input
        className="preview-scrub"
        type="range"
        min="0"
        max={audio.duration || 1}
        step="0.1"
        value={Math.min(audio.position, audio.duration || 1)}
        disabled={!audio.duration}
        onChange={(event) => audio.seek(Number(event.target.value))}
        aria-label="Preview position"
      />
      <output className="preview-time" aria-live="off">
        {clock(audio.position)} /{' '}
        {audio.duration ? clock(audio.duration) : '—:—'}
      </output>
      <span className={`preview-status${audio.error ? ' error' : ''}`}>
        {audio.error ||
          (loading
            ? `Loading from ${previewProviderName(trackId)}…`
            : browsingAnotherTrack &&
                controlledTrack &&
                audio.phase === 'playing'
              ? `Playing ${controlledTrack.title} – ${controlledTrack.artist}`
              : browsingAnotherTrack &&
                  controlledTrack &&
                  audio.phase === 'paused'
                ? `Paused ${controlledTrack.title} – ${controlledTrack.artist}`
                : controlledTrack
                  ? 'Hardware keys ignored'
                  : `Official ${previewProviderName(trackId)} preview`)}
      </span>
    </div>
  );
}
