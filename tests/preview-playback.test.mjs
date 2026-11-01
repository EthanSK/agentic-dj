import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { transformSync } from 'esbuild';

// Run the real hook against deterministic Web Audio and hook primitives.
// Browser acceptance additionally covers React rendering and real audio.
function player() {
  const slots = [],
    requests = new Map(),
    sources = [],
    played = [];
  let cursor = 0;
  const react = {
    useRef(value) {
      const i = cursor++;
      return (slots[i] ??= { current: value });
    },
    useState(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = value;
      return [
        slots[i],
        (next) => {
          slots[i] = typeof next === 'function' ? next(slots[i]) : next;
        },
      ];
    },
    useCallback: (fn) => fn,
    useEffect() {},
  };
  class AudioContext {
    currentTime = 0;
    resume() {
      return Promise.resolve();
    }
    createGain() {
      return { gain: { value: 0 }, connect() {} };
    }
    decodeAudioData(bytes) {
      return Promise.resolve({ duration: 60, id: bytes });
    }
    createBufferSource() {
      const source = {
        connect() {},
        disconnect() {},
        start() {
          this.started = true;
        },
        stop() {
          this.stopped = true;
        },
      };
      sources.push(source);
      return source;
    }
  }
  const code = transformSync(
    readFileSync(
      new URL('../components/preview-player.tsx', import.meta.url),
      'utf8',
    ),
    { loader: 'tsx', format: 'cjs' },
  ).code;
  const compiled = { exports: {} };
  runInNewContext(code, {
    module: compiled,
    exports: compiled.exports,
    require: (name) =>
      name === 'react'
        ? react
        : name === '@/lib/preview-source'
          ? { previewAudioUrl: (id) => id }
          : name === '@/lib/listening-memory'
            ? { rememberPlayedTrack: (id) => played.push(id) }
            : {},
    AudioContext,
    AbortController,
    DOMException,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    fetch: (id) =>
      new Promise((resolve) =>
        requests.set(id, () =>
          resolve({ ok: true, arrayBuffer: async () => id }),
        ),
      ),
  });
  const render = () => {
    cursor = 0;
    return compiled.exports.usePreviewAudio({ enabled: true, volume: 10 });
  };
  const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  };
  return { render, requests, sources, played, flush };
}
const a = { trackId: '1', recordId: 'record-a', title: 'A', artist: 'Test' };
const b = { trackId: '2', recordId: 'record-b', title: 'B', artist: 'Test' };

test('selecting another track replaces playback; selecting it twice does not pause', async () => {
  const p = player();
  const first = p.render().play(a);
  await p.flush();
  p.requests.get('1')();
  await first;
  const second = p.render().play(b);
  await p.flush();
  assert.equal(p.sources[0].stopped, true);
  p.requests.get('2')();
  await second;
  assert.equal(p.render().activeTrack.trackId, '2');
  assert.equal(p.render().phase, 'playing');
  assert.deepEqual(p.played, ['record-a', 'record-b']);
  await p.render().play(b);
  assert.equal(p.sources.length, 2);
  await p.render().toggle(b);
  assert.equal(p.render().phase, 'paused');
  await p.render().toggle(a);
  assert.equal(p.render().activeTrack.trackId, '1');
  assert.equal(p.render().phase, 'playing');
});

test('rapid selections and stop invalidate delayed playback', async () => {
  const p = player();
  const first = p.render().play(a);
  await p.flush();
  const second = p.render().play(b);
  await p.flush();
  p.requests.get('2')();
  await second;
  p.requests.get('1')();
  await first;
  assert.equal(p.render().activeTrack.trackId, '2');
  assert.equal(p.sources.length, 1);
  p.render().stop();
  const third = p.render().play(a);
  p.render().stop();
  await third;
  assert.equal(p.render().phase, 'idle');
  assert.equal(p.sources.length, 1);
});
