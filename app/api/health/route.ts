import { guardLocalRequest, json } from '@/lib/security';
import packageJson from '../../../package.json';
export async function GET(request: Request) {
  try {
    guardLocalRequest(request);
  } catch {
    return json({ error: 'Local requests only.' }, 403);
  }
  return json({
    app: 'agentic-dj',
    version: packageJson.version,
    localOnly: true,
  });
}
