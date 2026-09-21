import { query } from '@/lib/db';
import { localMailEnabled } from '@/lib/mail';
import { json } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
    const hostname = new URL(request.url).hostname;
    if (!localMailEnabled() || !['localhost', '127.0.0.1', '[::1]'].includes(hostname))
        return json({ error: 'not_found' }, 404);
    return json({ messages: (await query("SELECT * FROM mail WHERE created>$1 ORDER BY created DESC LIMIT 20", [Date.now() - 10 * 60000])).rows });
}
