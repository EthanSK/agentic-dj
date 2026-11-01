// Shared source labels for the track card, queue and exports. A Beatport
// preview says where audio plays, never where the suggestion was discovered.
import type { Track } from './types.ts';

export function discoveryLabel(track: Pick<Track, 'discovery'>): string {
  const discovery = track.discovery;
  if (!discovery) return 'Source not recorded';
  switch (discovery.source) {
    case 'spotify-likes':
      return 'From your Spotify likes';
    case 'agent':
      switch (discovery.basedOn) {
        case 'past-likes':
          return 'New pick from your Keeps';
        case 'birthday':
          return 'Inspired by your birthday favourites';
        case 'request':
          return 'Found for your request';
        case undefined:
          return 'Agent pick';
      }
    case 'rekordbox':
      return discovery.basedOn === 'birthday'
        ? 'Inspired by your birthday favourites'
        : 'Inspired by your Rekordbox';
    case 'user':
      return 'Added by you';
  }
}
