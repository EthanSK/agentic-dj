import assert from 'node:assert/strict';
import test from 'node:test';
import demo from '../data/demo-crate.json' with { type: 'json' };
import {
  DEFAULT_PREVIEW_VOLUME,
  normalisePreviewVolume,
  playerUrl,
} from '../lib/player.ts';
import { validateCrate } from '../lib/domain.ts';

void test('official Bandcamp players start at the quiet default', () => {
  const track = validateCrate(demo).tracks[0];
  assert.equal(DEFAULT_PREVIEW_VOLUME, 25);
  assert.match(playerUrl(track), /\?volume=0\.25$/);
  assert.match(playerUrl(track, 10), /\?volume=0\.1$/);
});

void test('preview volume is bounded and a zero value cannot become full volume', () => {
  const track = validateCrate(demo).tracks[0];
  assert.equal(normalisePreviewVolume(-20), 0);
  assert.equal(normalisePreviewVolume(160), 100);
  assert.equal(normalisePreviewVolume(Number.NaN), 25);
  assert.match(playerUrl(track, 0), /\?volume=0\.001$/);
});

void test('Spotify embeds retain provider controls', () => {
  const track = validateCrate(demo).tracks[0];
  track.preview = { provider: 'spotify', id: '0123456789012345678901' };
  assert.equal(
    playerUrl(track, 5),
    'https://open.spotify.com/embed/track/0123456789012345678901?theme=0',
  );
});
