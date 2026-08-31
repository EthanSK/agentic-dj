import { readState } from '@/db/store';
import { guardLocalRequest, json } from '@/lib/security';
import { InputError } from '@/lib/domain';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    guardLocalRequest(request);
    return json(await readState());
  } catch (error) {
    return json(
      {
        error:
          error instanceof InputError
            ? error.message
            : 'Could not read the local library. Your saved data has not been changed.',
      },
      error instanceof InputError ? 403 : 500,
    );
  }
}
