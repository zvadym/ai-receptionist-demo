import { db } from '@/lib/db';
import { localMailEnabled } from '@/lib/mail';
import { json } from '@/lib/http';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  const hostname = new URL(request.url).hostname;
  if (!localMailEnabled() || !['localhost','127.0.0.1','[::1]'].includes(hostname)) return json({ error: 'not_found' }, 404);
  return json({ messages: db().prepare('SELECT * FROM mail WHERE created>? ORDER BY created DESC LIMIT 20').all(Date.now() - 10 * 60_000) });
}
