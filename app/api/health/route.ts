import { guardLocalRequest, json } from '@/lib/security';
export async function GET(request: Request) {
  try {
    guardLocalRequest(request);
  } catch {
    return json({ error: 'Local requests only.' }, 403);
  }
  return json({ app: 'agentic-dj', version: '0.2.0', localOnly: true });
}
