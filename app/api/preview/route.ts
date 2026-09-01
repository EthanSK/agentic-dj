import {
  bandcampEmbedUrl,
  parseBandcampPreview,
  validateBandcampTrackId,
} from '@/lib/bandcamp-preview';
import { InputError } from '@/lib/domain';
import { guardLocalRequest, json } from '@/lib/security';

export const dynamic = 'force-dynamic';
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 20 * 1024 * 1024;

async function readLimited(
  response: Response,
  limit: number,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > limit)
    throw new Error('The provider response is too large to load safely.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The provider returned an empty response.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error('The provider response is too large to load safely.');
    }
    chunks.push(value);
  }
  if (!size) throw new Error('The provider returned an empty response.');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function GET(request: Request) {
  try {
    guardLocalRequest(request);
    const requestedId = new URL(request.url).searchParams.get('id') || '';
    if (!/^\d{1,12}$/.test(requestedId))
      return json({ error: 'Invalid Bandcamp track ID.' }, 400);
    const trackId = validateBandcampTrackId(requestedId);
    const embedResponse = await fetch(bandcampEmbedUrl(trackId), {
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!embedResponse.ok)
      throw new Error('Bandcamp did not return the preview page.');

    const embedBytes = await readLimited(embedResponse, MAX_METADATA_BYTES);
    const preview = parseBandcampPreview(
      new TextDecoder().decode(embedBytes),
      trackId,
    );
    const streamResponse = await fetch(preview.streamUrl, {
      headers: { Accept: 'audio/mpeg' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!streamResponse.ok)
      throw new Error('Bandcamp did not return the preview audio.');

    const audio = await readLimited(streamResponse, MAX_PREVIEW_BYTES);
    const audioBody = new ArrayBuffer(audio.byteLength);
    new Uint8Array(audioBody).set(audio);

    return new Response(audioBody, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audio.byteLength),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    const localError = error instanceof InputError;
    return json(
      {
        error: localError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Could not load the official Bandcamp preview.',
      },
      localError ? 403 : 502,
    );
  }
}
