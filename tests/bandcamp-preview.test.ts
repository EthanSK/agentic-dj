import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  bandcampEmbedUrl,
  bandcampPreviewPath,
  parseBandcampPreview,
  validateBandcampTrackId,
} from '../lib/bandcamp-preview.ts';

const fixture = `
  <script data-player-data="{&quot;tracks&quot;:[{&quot;id&quot;:653154192,&quot;duration&quot;:264.173,&quot;file&quot;:{&quot;mp3-128&quot;:&quot;https://t4.bcbits.com/stream/a71a3642f071996126f5f9c7c3f4f730/mp3-128/653154192?p=0&amp;t=signed&quot;}}]}"></script>
`;

void test('extracts only the requested official Bandcamp preview', () => {
  assert.deepEqual(parseBandcampPreview(fixture, '653154192'), {
    streamUrl:
      'https://t4.bcbits.com/stream/a71a3642f071996126f5f9c7c3f4f730/mp3-128/653154192?p=0&t=signed',
    duration: 264.173,
  });
  assert.equal(bandcampPreviewPath('653154192'), '/api/preview?id=653154192');
  assert.match(bandcampEmbedUrl('653154192'), /track=653154192/);
});

void test('rejects invalid IDs, mismatched tracks and unexpected stream hosts', () => {
  assert.throws(() => validateBandcampTrackId('../secret'));
  assert.throws(() => parseBandcampPreview(fixture, '123'));
  assert.throws(() =>
    parseBandcampPreview(
      fixture.replace('t4.bcbits.com', 'attacker.example'),
      '653154192',
    ),
  );
});

void test('the listening path has no controllable media element or Media Session handler', () => {
  const player = readFileSync(
    new URL('../components/preview-player.tsx', import.meta.url),
    'utf8',
  );
  const desk = readFileSync(
    new URL('../components/listening-desk.tsx', import.meta.url),
    'utf8',
  );
  const source = `${player}\n${desk}`;
  assert.match(player, /new AudioContext\(\)/);
  assert.doesNotMatch(source, /<audio|<iframe|mediaSession|setActionHandler/);
});
