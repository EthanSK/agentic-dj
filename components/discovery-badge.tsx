// The same compact discovery badge follows a track through active and past
// sessions. It is descriptive, not a Spotify player or another store link.
import { CircleHelp, Library, Music2, Sparkles, UserRound } from 'lucide-react';
import { discoveryLabel } from '@/lib/discovery';
import type { Track } from '@/lib/types';

export function DiscoveryBadge({
  track,
  compact = false,
  inline = false,
}: {
  track: Track;
  compact?: boolean;
  inline?: boolean;
}) {
  const source = track.discovery?.source;
  const Icon =
    source === 'spotify-likes'
      ? Music2
      : source === 'agent'
        ? Sparkles
        : source === 'rekordbox'
          ? Library
          : source === 'user'
            ? UserRound
            : CircleHelp;
  const label = discoveryLabel(track);
  return (
    <span
      className={`discovery-badge discovery-${source || 'unknown'}${compact ? ' discovery-compact' : ''}${inline ? ' discovery-inline' : ''}`}
      title={label}
      aria-label={compact ? label : undefined}
    >
      <Icon size={compact ? 12 : 14} strokeWidth={1.7} aria-hidden="true" />
      {!compact && <span>{label}</span>}
    </span>
  );
}
