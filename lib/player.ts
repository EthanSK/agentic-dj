import type { Track } from './types.ts';

export const DEFAULT_PREVIEW_VOLUME = 25;

export function normalisePreviewVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PREVIEW_VOLUME;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function playerUrl(
  track: Track,
  volume = DEFAULT_PREVIEW_VOLUME,
): string {
  if (track.preview?.provider === 'bandcamp') {
    const safeVolume = normalisePreviewVolume(volume);
    const playerVolume = Math.max(safeVolume / 100, 0.001);
    return `https://bandcamp.com/EmbeddedPlayer/track=${track.preview.id}/size=large/bgcol=ffffff/linkcol=356df3/tracklist=false/artwork=small/transparent=true/?volume=${playerVolume}`;
  }
  if (track.preview?.provider === 'spotify')
    return `https://open.spotify.com/embed/track/${track.preview.id}?theme=0`;
  return '';
}
