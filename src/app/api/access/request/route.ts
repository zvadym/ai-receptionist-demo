import { z } from 'zod';
import { normalizeEmail, rateLimit } from '@/lib/auth';
import { issueAccess, markAccessSent, markAccessFailed } from '@/lib/access-links';
import { sendAccessEmail } from '@/lib/access-mail';
import { body, handle, json } from '@/lib/http';
const schema = z.object({ email: z.email().max(254), name: z.string().trim().min(2).max(80), clinic: z.string().trim().max(160).default(''), language: z.enum(['uk', 'de', 'en']), website: z.string().max(0).optional() });
export async function POST(request: Request) {
    return handle(async () => {
        const input = schema.parse(await body(request));
        // Loopback-only local build: use a global cap, not spoofable forwarded IP headers.
        (await rateLimit('access:global', 20, 60 * 60000));
        const email = normalizeEmail(input.email);
        (await rateLimit(`email:${email}`, 4, 60 * 60000));
        const { request: saved, token } = (await issueAccess({ ...input, email }));
        try {
            const sent = await sendAccessEmail(saved, token);
            (await markAccessSent(saved.id, sent.providerId));
            return json({ sent: true, mailMode: sent.mode });
        }
        catch (error) {
            (await markAccessFailed(saved.id));
            throw error;
        }
    });
}
