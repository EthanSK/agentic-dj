const BANDCAMP_EMBED_BASE = 'https://bandcamp.com/EmbeddedPlayer';
const BANDCAMP_STREAM_HOST = /^t\d+\.bcbits\.com$/;
const BANDCAMP_TRACK_ID = /^\d{1,12}$/;

type BandcampPlayerTrack = {
  id?: unknown;
  duration?: unknown;
  file?: unknown;
};

export type BandcampPreview = {
  streamUrl: string;
  duration?: number;
};

export function validateBandcampTrackId(value: string): string {
  if (!BANDCAMP_TRACK_ID.test(value))
    throw new Error('Invalid Bandcamp track ID.');
  return value;
}

export function bandcampEmbedUrl(trackId: string): string {
  const safeId = validateBandcampTrackId(trackId);
  return `${BANDCAMP_EMBED_BASE}/track=${safeId}/size=large/tracklist=false/artwork=none/transparent=true/`;
}

export function bandcampPreviewPath(trackId: string): string {
  return `/api/preview?id=${encodeURIComponent(validateBandcampTrackId(trackId))}`;
}

function decodeHtmlAttribute(value: string): string {
  return value.replace(
    /&(quot|amp|#39|lt|gt);/g,
    (entity) =>
      ({
        '&quot;': '"',
        '&amp;': '&',
        '&#39;': "'",
        '&lt;': '<',
        '&gt;': '>',
      })[entity] || entity,
  );
}

export function parseBandcampPreview(
  html: string,
  trackId: string,
): BandcampPreview {
  const safeId = validateBandcampTrackId(trackId);
  const match = html.match(/\sdata-player-data="([^"]+)"/);
  if (!match) throw new Error('Bandcamp did not return preview metadata.');

  let data: { tracks?: unknown };
  try {
    data = JSON.parse(decodeHtmlAttribute(match[1])) as { tracks?: unknown };
  } catch {
    throw new Error('Bandcamp returned invalid preview metadata.');
  }

  if (!Array.isArray(data.tracks))
    throw new Error('This Bandcamp track has no playable preview.');
  const track = (data.tracks as BandcampPlayerTrack[]).find(
    (candidate) => String(candidate.id) === safeId,
  );
  if (!track || !track.file || typeof track.file !== 'object')
    throw new Error('This Bandcamp track has no playable preview.');

  const stream = (track.file as Record<string, unknown>)['mp3-128'];
  if (typeof stream !== 'string')
    throw new Error('This Bandcamp track has no playable preview.');

  const url = new URL(stream);
  if (
    url.protocol !== 'https:' ||
    !BANDCAMP_STREAM_HOST.test(url.hostname) ||
    !new RegExp(`^/stream/[a-f0-9]+/mp3-128/${safeId}$`).test(url.pathname)
  )
    throw new Error('Bandcamp returned an unexpected preview address.');

  return {
    streamUrl: url.toString(),
    duration:
      typeof track.duration === 'number' && Number.isFinite(track.duration)
        ? track.duration
        : undefined,
  };
}
