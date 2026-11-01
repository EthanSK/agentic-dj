// Verify that real Beatport cover art can enter audition crates without
// broadening the import boundary to arbitrary hosts or unsafe URL forms.
import assert from 'node:assert/strict';
import test from 'node:test';
import demo from '../data/demo-crate.json' with { type: 'json' };
import { validateTrack } from '../lib/domain.ts';

const artwork =
  'https://geo-media.beatport.com/image_size/250x250/25a917aa-af29-4ad1-a541-076552f61bf7.jpg';

void test('official Beatport artwork survives track validation', () => {
  assert.equal(validateTrack({ ...demo.tracks[0], artwork }).artwork, artwork);
});

void test('Beatport-looking artwork cannot bypass the exact HTTPS host boundary', () => {
  for (const unsafe of [
    artwork.replace('https:', 'http:'),
    artwork.replace(
      'geo-media.beatport.com',
      'geo-media.beatport.com.example.com',
    ),
    artwork.replace('geo-media.beatport.com', 'example.com'),
    artwork.replace('https://', 'https://name:secret@'),
    artwork.replace('geo-media.beatport.com/', 'geo-media.beatport.com:8080/'),
  ]) {
    assert.throws(() => validateTrack({ ...demo.tracks[0], artwork: unsafe }));
  }
});
