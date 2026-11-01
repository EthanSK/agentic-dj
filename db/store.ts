import { env } from 'cloudflare:workers';
import initialCrate from '@/data/demo-crate.json';
import migration from '@/drizzle/0000_desk_state.sql?raw';
import {
  asState,
  backfillBundledTrackMetadata,
  ConflictError,
  initialPayload,
  planMutation,
} from '@/lib/domain';
import { normaliseSessionState } from '@/lib/sessions';
import type { DeskState, StoredPayload } from '@/lib/types';

type Row = { payload: string; revision: number; updated_at: string };
let ready: Promise<void> | undefined;
async function initialise(): Promise<void> {
  await env.DB.prepare(
    migration.replace(
      'CREATE TABLE `desk_state`',
      'CREATE TABLE IF NOT EXISTS `desk_state`',
    ),
  ).run();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO desk_state (id, revision, payload, updated_at) VALUES (1, 0, ?, ?)',
  )
    .bind(
      JSON.stringify(initialPayload(initialCrate)),
      new Date().toISOString(),
    )
    .run();
}
async function ensure(): Promise<void> {
  if (!env.DB)
    throw new Error(
      'Local database binding is unavailable. Start the app using npm start.',
    );
  ready ??= initialise().catch((error) => {
    ready = undefined;
    throw error;
  });
  await ready;
}
function decode(row: Row): DeskState {
  const stored = JSON.parse(row.payload) as StoredPayload;
  if (stored.schemaVersion !== 1)
    throw new Error(
      'Unsupported local data version. Restore a compatible app version; your data has not been changed.',
    );
  // Sessions are additive to schema version 1. A library saved before them
  // gets inferred sessions in memory here; reads never write, and the next
  // ordinary mutation persists exactly what was shown. Damaged session data
  // throws, so it is never overwritten by a fresh guess.
  return asState(
    backfillBundledTrackMetadata(normaliseSessionState(stored), initialCrate),
    row.revision,
    row.updated_at,
  );
}
export async function readState(): Promise<DeskState> {
  await ensure();
  const row = await env.DB.prepare(
    'SELECT payload, revision, updated_at FROM desk_state WHERE id = 1',
  ).first<Row>();
  if (!row) throw new Error('Local database is not initialised.');
  return decode(row);
}
export async function mutate(
  command: Record<string, unknown>,
): Promise<DeskState> {
  const current = await readState();
  const next = planMutation(current, command);
  if (!next) return current;
  const { revision } = current;
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    'UPDATE desk_state SET payload = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ? RETURNING payload, revision, updated_at',
  )
    .bind(JSON.stringify(next), now, revision)
    .first<Row>();
  if (!row)
    throw new ConflictError(
      'Another tab saved first. The latest state has been loaded; please retry.',
    );
  return decode(row);
}
