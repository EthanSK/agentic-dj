import { bandcampPreviewPath } from './bandcamp-preview.ts';
import type { Track } from './types.ts';

export const BEATPORT_SAMPLE_ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

// Ethan's "don't use Spotify anymore" applies to audition playback.
// Legacy Spotify identifiers remain readable without becoming listening links.
export function playablePreviewId(
  preview: Track['preview'],
): string | undefined {
  if (preview?.provider === 'bandcamp') return preview.id;
  if (preview?.provider === 'beatport' && BEATPORT_SAMPLE_ID.test(preview.id))
    return `beatport:${preview.id}`;
  return undefined;
}

export function previewAudioUrl(key: string): string {
  if (!key.startsWith('beatport:')) return bandcampPreviewPath(key);
  const sampleId = key.slice('beatport:'.length);
  if (!BEATPORT_SAMPLE_ID.test(sampleId))
    throw new Error('Invalid Beatport preview ID.');
  // Only the public LOFI preview observed on the exact official track page.
  // Fetch directly with CORS; no audio proxy, arbitrary URL or full-track path.
  return `https://geo-samples.beatport.com/track/${sampleId}.LOFI.mp3`;
}

export function previewProviderName(key: string): string {
  return key.startsWith('beatport:') ? 'Beatport' : 'Bandcamp';
}

export function musicStoreLink(track: Track): { url: string; name: string } {
  if (new URL(track.sourceUrl).hostname === 'open.spotify.com')
    return {
      url: `https://www.beatport.com/search/tracks?q=${encodeURIComponent(`${track.artist} ${track.title}`)}`,
      name: 'Search Beatport',
    };
  return { url: track.sourceUrl, name: track.sourceName };
}

// Audition readiness is distinct from ownership or musical taste. Ethan wants
// unavailable previews out of the queue, not converted into negative votes.
export function isAuditionReady(
  track: Track | undefined,
  requireBeatport = false,
): boolean {
  if (!track || !playablePreviewId(track.preview)) return false;
  if (!requireBeatport) return true;
  try {
    const url = new URL(track.sourceUrl);
    return (
      url.protocol === 'https:' &&
      ['www.beatport.com', 'beatport.com'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      /^\/(?:[a-z]{2}\/)?track\/[^/]+\/\d+\/?$/.test(url.pathname) &&
      track.preview?.provider === 'beatport'
    );
  } catch {
    return false;
  }
}
