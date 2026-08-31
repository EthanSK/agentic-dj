import { InputError } from './domain.ts';

export function guardLocalRequest(request: Request, mutation = false): void {
  const url = new URL(request.url);
  const host = request.headers.get('host') || url.host;
  if (
    !/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host) ||
    !['localhost', '127.0.0.1'].includes(url.hostname)
  )
    throw new InputError(
      'Agentic DJ only accepts local requests. Do not expose this server publicly.',
    );
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin)
    throw new InputError('Cross-origin requests are not allowed.');
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site' || site === 'same-site')
    throw new InputError('Use the app on its own localhost origin.');
  if (
    mutation &&
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    throw new InputError('Send commands as application/json.');
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export async function commandBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const limit = 900000;
  if (Number(request.headers.get('content-length')) > limit)
    throw new InputError('Import is too large (maximum 900 KB).');
  const reader = request.body?.getReader();
  if (!reader) throw new InputError('Missing command body.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new InputError('Import is too large (maximum 900 KB).');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new InputError('The file or command is not valid JSON.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InputError('Expected a JSON command.');
  return value as Record<string, unknown>;
}
