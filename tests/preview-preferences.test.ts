import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readPreviewPreferences,
  savePreviewPreferences,
} from '../lib/preview-preferences.ts';

void test('preview settings survive reload reads, including mute and disabled previews', () => {
  let raw: string | null = null;
  const store = () => ({
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  });
  assert.deepEqual(readPreviewPreferences(store), {
    volume: 25,
    playersAllowed: false,
  });
  savePreviewPreferences({ volume: 13 }, store);
  savePreviewPreferences({ playersAllowed: true }, store);
  assert.deepEqual(readPreviewPreferences(store), {
    volume: 13,
    playersAllowed: true,
  });
  savePreviewPreferences({ volume: 0 }, store);
  assert.deepEqual(readPreviewPreferences(store), {
    volume: 0,
    playersAllowed: true,
  });
  savePreviewPreferences({ playersAllowed: false }, store);
  assert.deepEqual(readPreviewPreferences(store), {
    volume: 0,
    playersAllowed: false,
  });
});

void test('invalid or unavailable browser storage fails safely', () => {
  for (const raw of [
    'garbage',
    'null',
    '{"volume":"99","playersAllowed":"true"}',
  ]) {
    assert.deepEqual(
      readPreviewPreferences(() => ({ getItem: () => raw, setItem() {} })),
      { volume: 25, playersAllowed: false },
    );
  }
  const blocked = () => {
    throw new Error('Storage blocked');
  };
  assert.deepEqual(readPreviewPreferences(blocked), {
    volume: 25,
    playersAllowed: false,
  });
  assert.doesNotThrow(() => savePreviewPreferences({ volume: 5 }, blocked));
  assert.equal(
    readPreviewPreferences(() => ({
      getItem: () => '{"volume":999}',
      setItem() {},
    })).volume,
    100,
  );
});
