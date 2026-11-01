import { readState } from '@/db/store';
import { agentBrief, publicCrate, shortlistCsv } from '@/lib/domain';
import { nextRoundNumber, scopeSummary } from '@/lib/sessions';
import { guardLocalRequest, json } from '@/lib/security';
import { isKeepSort, sortKeepTracks } from '@/lib/keep-order';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    guardLocalRequest(request);
  } catch {
    return json({ error: 'Local requests only.' }, 403);
  }
  const state = await readState();
  const params = new URL(request.url).searchParams;
  const format = params.get('format') || 'csv';
  let body: string, name: string, type: string;
  if (format === 'csv' || format === 'keepers') {
    // Keeps are a buying shortlist, so they default to the current session.
    // `session=all` is the explicit whole-library export; a saved session ID
    // exports that past session.
    const scope = scopeSummary(
      state,
      params.get('session') || 'current',
      Date.now(),
    );
    if (!scope)
      return json(
        { error: 'Choose session=current, session=all or a saved session ID.' },
        400,
      );
    const fileScope = scope.kind === 'all' ? 'all-sessions' : scope.id;
    const requestedSort = params.get('sort') || 'recommended';
    if (!isKeepSort(requestedSort))
      return json({ error: 'Choose recommended, newest or oldest.' }, 400);
    if (format === 'csv') {
      body = shortlistCsv(state, scope, requestedSort);
      name = `agentic-dj-keepers-${fileScope}.csv`;
      type = 'text/csv; charset=utf-8';
    } else {
      body = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          purchaseAuthorised: false,
          scope: {
            kind: scope.kind,
            id: scope.id,
            label: scope.label,
            status: scope.status,
            startedAt: scope.startedAt,
            lastActivityAt: scope.lastActivityAt,
          },
          sort: requestedSort,
          tracks: sortKeepTracks(
            scope.keptIds.map((id) => state.tracks[id]).filter(Boolean),
            state.votes,
            requestedSort,
          ).map((track) => ({
            ...track,
            decision: state.votes[track.id],
          })),
        },
        null,
        2,
      );
      name = `agentic-dj-keepers-${fileScope}.json`;
      type = 'application/json';
    }
  } else if (format === 'brief' || format === 'next') {
    body = agentBrief(state);
    name =
      format === 'next'
        ? `agentic-dj-request-round-${nextRoundNumber(state)}.md`
        : 'agentic-dj-private-brief.md';
    type = 'text/markdown; charset=utf-8';
  } else if (format === 'crate') {
    body = JSON.stringify(publicCrate(state), null, 2);
    name = 'agentic-dj-crate.json';
    type = 'application/json';
  } else if (format === 'backup') {
    body = JSON.stringify(state, null, 2);
    name = 'agentic-dj-private-backup.json';
    type = 'application/json';
  } else
    return json(
      { error: 'Choose csv, keepers, crate, brief, next or backup.' },
      400,
    );
  return new Response(body, {
    headers: {
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
