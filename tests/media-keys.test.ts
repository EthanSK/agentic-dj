import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BLOCKED_MEDIA_KEY_ACTIONS,
  blockHardwareMediaKeys,
  EMBEDDED_PLAYER_ALLOW,
} from '../lib/media-keys.ts';

void test('embedded players cannot claim a Media Session', () => {
  assert.match(EMBEDDED_PLAYER_ALLOW, /mediasession 'none'/);
});

void test('blocks play and pause without touching on-page audio controls', () => {
  const handlers = new Map<string, (() => void) | null>();
  const shield = blockHardwareMediaKeys({
    setActionHandler(action, handler) {
      handlers.set(action, handler);
    },
  });

  assert.deepEqual([...handlers.keys()], [...BLOCKED_MEDIA_KEY_ACTIONS]);
  assert.equal(typeof handlers.get('play'), 'function');
  assert.equal(typeof handlers.get('pause'), 'function');
  assert.doesNotThrow(() => handlers.get('play')?.());

  assert.deepEqual(shield.blockedActions, ['play', 'pause']);
  shield.release();
  assert.equal(handlers.get('play'), null);
  assert.equal(handlers.get('pause'), null);
});

void test('is a safe no-op when Media Session is unavailable', () => {
  const shield = blockHardwareMediaKeys(undefined);
  assert.deepEqual(shield.blockedActions, []);
  assert.doesNotThrow(shield.release);
});

void test('continues when a browser rejects one action', () => {
  const registered: string[] = [];
  const shield = blockHardwareMediaKeys({
    setActionHandler(action) {
      if (action === 'play') throw new TypeError('unsupported');
      registered.push(action);
    },
  });

  assert.deepEqual(registered, ['pause']);
  assert.deepEqual(shield.blockedActions, ['pause']);
  assert.doesNotThrow(shield.release);
});
