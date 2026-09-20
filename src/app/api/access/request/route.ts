import { z } from 'zod';
import { issueCode, normalizeEmail, rateLimit } from '@/lib/auth';
import { deliverCode } from '@/lib/mail';
import { body, handle, json } from '@/lib/http';
import { db } from '@/lib/db';
const schema = z.object({ email: z.email().max(254), name: z.string().trim().min(2).max(80), language: z.enum(['uk','de','en']), website: z.string().max(0).optional() });
export async function POST(request: Request) {
  return handle(async () => {
    const input = schema.parse(await body(request));
    // Loopback-only local build: use a global cap, not spoofable forwarded IP headers.
    rateLimit('access:global', 20, 60 * 60_000);
    const email = normalizeEmail(input.email);
    const code = issueCode(email, input.name);
    const issued = db().prepare('SELECT hash FROM codes WHERE email=?').get(email) as { hash: string };
    try { return json({ delivered: true, mailMode: await deliverCode(email, code, input.language) }); }
    catch (error) { db().prepare('DELETE FROM codes WHERE email=? AND hash=?').run(email, issued.hash); throw error; }
  });
}
