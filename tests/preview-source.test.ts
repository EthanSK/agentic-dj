import assert from 'node:assert/strict';
import test from 'node:test';
import {
  musicStoreLink,
  playablePreviewId,
  previewAudioUrl,
} from '../lib/preview-source.ts';
import { validateCrate } from '../lib/domain.ts';
import { readFileSync } from 'node:fs';

const sample = '1a15a2a7-5cbf-40f5-a523-904e51078cd5';

void test('Beatport uses only its public LOFI sample directly; legacy Spotify has no playback', () => {
  assert.equal(
    playablePreviewId({ provider: 'beatport', id: sample }),
    `beatport:${sample}`,
  );
  assert.equal(
    previewAudioUrl(`beatport:${sample}`),
    `https://geo-samples.beatport.com/track/${sample}.LOFI.mp3`,
  );
  assert.equal(
    playablePreviewId({ provider: 'spotify', id: '5BXBi5pLeJhblMVH2ltjpl' }),
    undefined,
  );
  assert.equal(playablePreviewId({ provider: 'bandcamp', id: '123' }), '123');
  for (const bad of [
    'https://attacker.example/track.mp3',
    '../secret',
    sample + '?url=https://attacker.example',
  ])
    assert.throws(() => previewAudioUrl(`beatport:${bad}`));
});

void test('import accepts typed Beatport IDs and preserves legacy Spotify records', () => {
  const crate = JSON.parse(
    readFileSync(new URL('../data/demo-crate.json', import.meta.url), 'utf8'),
  );
  crate.tracks[0].preview = { provider: 'beatport', id: sample };
  assert.equal(validateCrate(crate).tracks[0].preview?.id, sample);
  const legacy = {
    ...crate.tracks[0],
    sourceUrl: 'https://open.spotify.com/track/5BXBi5pLeJhblMVH2ltjpl',
  };
  assert.equal(musicStoreLink(legacy).name, 'Search Beatport');
  assert.match(
    musicStoreLink(legacy).url,
    /^https:\/\/www.beatport.com\/search\/tracks\?q=/,
  );
  crate.tracks[0].preview.id = 'https://attacker.example/x';
  assert.throws(() => validateCrate(crate));
});
