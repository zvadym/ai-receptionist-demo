import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query } from './db';
import { normalizeEmail, rateLimit } from './auth';
import { AppError } from './errors';
import { localMailEnabled } from './mail';
const schema = z.object({
    name: z.string().trim().min(2).max(80), email: z.email().max(254),
    message: z.string().trim().min(10).max(2000), language: z.enum(['en', 'de', 'uk']),
    website: z.string().max(0).optional(),
});
export async function requestDeveloperCall(value: unknown, fetcher: typeof fetch = fetch) {
    const input = schema.parse(value);
    const email = normalizeEmail(input.email);
    (await rateLimit('contact:global', 20, 60 * 60000));
    (await rateLimit(`contact:${email}`, 3, 60 * 60000));
    const id = randomUUID();
    (await query("INSERT INTO contact_requests(id,name,email,message,language,created,send_status) VALUES ($1,$2,$3,$4,$5,$6,$7)", [id, input.name, email, input.message, input.language, Date.now(), 'pending']));
    const subject = 'Developer call request · Linden AI';
    const text = `Name: ${input.name}\nEmail: ${email}\nLanguage: ${input.language}\n\n${input.message}`;
    try {
        if (localMailEnabled()) {
            (await query("INSERT INTO mail(id,recipient,subject,body,created) VALUES ($1,$2,$3,$4,$5)", [id, 'contact@example.test', subject, text, Date.now()]));
            (await query("UPDATE contact_requests SET send_status='local' WHERE id=$1", [id]));
            return { saved: true, mailMode: 'local' };
        }
        if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM)
            throw new Error('mail_not_configured');
        const response = await fetcher('https://api.resend.com/emails', {
            method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `developer-call/${id}` },
            body: JSON.stringify({ from: process.env.RESEND_FROM, to: ['contact@example.test'], reply_to: email, subject, text }),
            signal: AbortSignal.timeout(15000),
        });
        const result = await response.json();
        if (!response.ok || typeof result.id !== 'string')
            throw new Error('mail_failed');
        (await query("UPDATE contact_requests SET send_status='sent',provider_id=$1 WHERE id=$2", [result.id, id]));
        return { saved: true, mailMode: 'resend' };
    }
    catch {
        (await query("UPDATE contact_requests SET send_status='failed' WHERE id=$1", [id]));
        throw new AppError('contact_delivery_failed', 502);
    }
}
