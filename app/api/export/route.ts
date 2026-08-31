import { readState } from '@/db/store';
import {
  activeTracks,
  agentBrief,
  publicCrate,
  shortlistCsv,
} from '@/lib/domain';
import { guardLocalRequest, json } from '@/lib/security';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    guardLocalRequest(request);
  } catch {
    return json({ error: 'Local requests only.' }, 403);
  }
  const state = await readState();
  const format = new URL(request.url).searchParams.get('format') || 'csv';
  let body: string, name: string, type: string;
  if (format === 'csv') {
    body = shortlistCsv(state);
    name = 'agentic-dj-keepers.csv';
    type = 'text/csv; charset=utf-8';
  } else if (format === 'brief') {
    body = agentBrief(state);
    name = 'agentic-dj-private-brief.md';
    type = 'text/markdown; charset=utf-8';
  } else if (format === 'crate') {
    body = JSON.stringify(publicCrate(state), null, 2);
    name = 'agentic-dj-crate.json';
    type = 'application/json';
  } else if (format === 'backup') {
    body = JSON.stringify(state, null, 2);
    name = 'agentic-dj-private-backup.json';
    type = 'application/json';
  } else if (format === 'keepers') {
    body = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        purchaseAuthorised: false,
        tracks: activeTracks(state)
          .filter((t) => state.votes[t.id]?.verdict === 'keep')
          .map((t) => ({ ...t, decision: state.votes[t.id] })),
      },
      null,
      2,
    );
    name = 'agentic-dj-keepers.json';
    type = 'application/json';
  } else
    return json({ error: 'Choose csv, keepers, crate, brief or backup.' }, 400);
  return new Response(body, {
    headers: {
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
