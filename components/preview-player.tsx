'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Pause, Play } from 'lucide-react';
import { bandcampPreviewPath } from '@/lib/bandcamp-preview';

type Phase = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';

function clock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function PreviewPlayer({
  trackId,
  title,
  artist,
  volume,
}: {
  trackId: string;
  title: string;
  artist: string;
  volume: number;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const contextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playingRef = useRef(false);
  const offsetRef = useRef(0);
  const startedAtRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const cancelFrame = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  };

  const currentPosition = () => {
    const context = contextRef.current;
    const buffer = bufferRef.current;
    if (!context || !buffer || !playingRef.current) return offsetRef.current;
    return Math.min(
      buffer.duration,
      offsetRef.current + context.currentTime - startedAtRef.current,
    );
  };

  const stopSource = () => {
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
  };

  const startClock = () => {
    cancelFrame();
    const tick = () => {
      if (!playingRef.current || !mountedRef.current) return;
      setPosition(currentPosition());
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  };

  const startPlayback = () => {
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
    setPosition(offsetRef.current);
    setPhase('playing');
    startClock();
  };

  const loadAudio = async (): Promise<AudioBuffer> => {
    let context = contextRef.current;
    if (!context) {
      context = new AudioContext();
      const gain = context.createGain();
      gain.gain.value = volume / 100;
      gain.connect(context.destination);
      contextRef.current = context;
      gainRef.current = gain;
    }

    await context.resume();
    if (bufferRef.current) return bufferRef.current;

    setPhase('loading');
    setError('');
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const response = await fetch(bandcampPreviewPath(trackId), {
      cache: 'no-store',
      signal: controller.signal,
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
    bufferRef.current = buffer;
    setDuration(buffer.duration);
    setPhase('ready');
    return buffer;
  };

  const toggle = async () => {
    if (playingRef.current) {
      const next = currentPosition();
      playingRef.current = false;
      offsetRef.current = next;
      stopSource();
      cancelFrame();
      setPosition(next);
      setPhase('paused');
      return;
    }

    try {
      await loadAudio();
      if (mountedRef.current) startPlayback();
    } catch (caught) {
      if (!mountedRef.current) return;
      if (caught instanceof DOMException && caught.name === 'AbortError')
        return;
      const message =
        caught instanceof Error
          ? caught.message
          : 'Could not load this preview.';
      setError(message);
      setPhase('error');
    }
  };

  const seek = (next: number) => {
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
  };

  useEffect(() => {
    const gain = gainRef.current;
    const context = contextRef.current;
    if (gain && context)
      gain.gain.setTargetAtTime(volume / 100, context.currentTime, 0.015);
  }, [volume]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      playingRef.current = false;
      stopSource();
      cancelFrame();
      const context = contextRef.current;
      contextRef.current = null;
      gainRef.current = null;
      bufferRef.current = null;
      if (context && context.state !== 'closed')
        void context.close().catch(() => undefined);
    };
  }, []);

  const loading = phase === 'loading';
  const playing = phase === 'playing';
  return (
    <div
      className="web-audio-player"
      data-preview-engine="web-audio"
      data-preview-phase={phase}
      data-track-id={trackId}
    >
      <button
        className="preview-toggle"
        onClick={() => void toggle()}
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
        max={duration || 1}
        step="0.1"
        value={Math.min(position, duration || 1)}
        disabled={!duration}
        onChange={(event) => seek(Number(event.target.value))}
        aria-label="Preview position"
      />
      <output className="preview-time" aria-live="off">
        {clock(position)} / {duration ? clock(duration) : '—:—'}
      </output>
      <span className={`preview-status${error ? ' error' : ''}`}>
        {error ||
          (loading
            ? 'Loading from Bandcamp…'
            : phase === 'idle'
              ? 'Official Bandcamp preview'
              : 'Hardware keys ignored')}
      </span>
    </div>
  );
}
