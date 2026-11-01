'use client';

// Per-record context for the listener and their agent. Position is a soft
// preference; editing it must not vote, replace audio or reorder To hear.
import type { Track } from '@/lib/types';

export type TrackNotesDraft = { user: string; agent: string };
export type TrackContextPatch = {
  userNotes?: string;
  agentNotes?: string;
  setPosition?: number | null;
};

export function TrackPlanning({
  track,
  busy,
  draft,
  onDraft,
  onSave,
}: {
  track: Track;
  busy: boolean;
  draft: TrackNotesDraft;
  onDraft: (draft: TrackNotesDraft) => void;
  onSave: (patch: TrackContextPatch) => Promise<boolean>;
}) {
  // Ethan's three buttons replace the fine-position slider. Keep the agent's
  // suggestion distinct from a saved user override; Clear restores it.
  const suggested = track.setPlacement?.section;
  const position =
    track.setPosition ??
    (suggested === 'beginning'
      ? 0
      : suggested === 'middle'
        ? 50
        : suggested === 'end'
          ? 100
          : undefined);
  const hasPosition = track.setPosition !== undefined;
  const notesChanged =
    draft.user !== (track.notes?.user ?? '') ||
    draft.agent !== (track.notes?.agent ?? '');
  const savePosition = async (value: number | null) => {
    if (value === (track.setPosition ?? null)) return;
    await onSave({ setPosition: value });
  };
  return (
    <section
      className="track-planning"
      aria-label="Track notes and set position"
    >
      <div className="position-heading">
        <strong>Set position</strong>
        <span>
          {position === undefined
            ? 'No preference'
            : position < 34
              ? 'Beginning'
              : position <= 66
                ? 'Middle'
                : 'End'}
        </span>
        {hasPosition && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void savePosition(null)}
          >
            Clear
          </button>
        )}
      </div>
      <fieldset className="position-choices" aria-label="Rough set position">
        {(
          [
            { label: 'Beginning', value: 0 },
            { label: 'Middle', value: 50 },
            { label: 'End', value: 100 },
          ] as const
        ).map(({ label, value }) => (
          <button
            key={label}
            type="button"
            disabled={busy}
            aria-pressed={
              position !== undefined &&
              (value === 0
                ? position < 34
                : value === 50
                  ? position >= 34 && position <= 66
                  : position > 66)
            }
            onClick={() => void savePosition(value)}
          >
            {label}
          </button>
        ))}
      </fieldset>
      <div className="position-footer">
        <span>A guide, not a fixed slot.</span>
      </div>
      <details className="track-notes">
        <summary>
          Track notes{(draft.user || draft.agent) && <span> · added</span>}
          {notesChanged && <span> · unsaved</span>}
        </summary>
        <div className="track-notes-body">
          <label>
            Your notes
            <textarea
              rows={2}
              maxLength={4000}
              value={draft.user}
              disabled={busy}
              placeholder="Anything you want the agent to know about this track"
              onChange={(event) =>
                onDraft({ ...draft, user: event.target.value })
              }
            />
          </label>
          <label>
            Agent notes
            <textarea
              rows={2}
              maxLength={4000}
              value={draft.agent}
              disabled={busy}
              placeholder="Context to use when planning the set"
              onChange={(event) =>
                onDraft({ ...draft, agent: event.target.value })
              }
            />
          </label>
          <button
            type="button"
            className="save-track-notes"
            disabled={busy || !notesChanged}
            onClick={() =>
              void onSave({ userNotes: draft.user, agentNotes: draft.agent })
            }
          >
            {notesChanged ? 'Save notes' : 'Notes saved'}
          </button>
        </div>
      </details>
    </section>
  );
}
