import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PREVIEW_VOLUME,
  normalisePreviewVolume,
} from '../lib/player.ts';

void test('official previews start at the quiet default', () => {
  assert.equal(DEFAULT_PREVIEW_VOLUME, 25);
});

void test('preview volume is bounded and zero stays muted', () => {
  assert.equal(normalisePreviewVolume(-20), 0);
  assert.equal(normalisePreviewVolume(160), 100);
  assert.equal(normalisePreviewVolume(Number.NaN), 25);
  assert.equal(normalisePreviewVolume(0), 0);
});
