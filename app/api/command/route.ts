import { mutate, readState } from '@/db/store';
import { ConflictError, InputError } from '@/lib/domain';
import { commandBody, guardLocalRequest, json } from '@/lib/security';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    guardLocalRequest(request, true);
  } catch {
    return json(
      { error: 'Only same-origin local JSON commands are accepted.' },
      403,
    );
  }
  try {
    return json(await mutate(await commandBody(request)));
  } catch (error) {
    if (error instanceof ConflictError)
      return json({ error: error.message, state: await readState() }, 409);
    if (error instanceof InputError) return json({ error: error.message }, 400);
    return json(
      {
        error:
          'The decision was not confirmed. Reload to check the saved state before retrying.',
      },
      500,
    );
  }
}
