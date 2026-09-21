import { db } from './db';
import { AppError } from './errors';
import { localMailEnabled } from './mail';
import type { AccessInput } from './access-links';

const messages = {
  en: { subject: 'Your personal demo is ready · Linden AI', title: 'Meet your next receptionist.', hello: 'Your access to the Linden AI demo is ready.', button: 'Open my demo', note: 'This personal link expires in 30 minutes and can be used once. Please do not share it.', footer: 'You received this email because you requested demo access. If this was not you, simply ignore it.' },
  de: { subject: 'Ihre persönliche Demo ist bereit · Linden AI', title: 'Lernen Sie Ihre neue Assistenz kennen.', hello: 'Ihr Zugang zur Linden AI Demo ist bereit.', button: 'Meine Demo öffnen', note: 'Dieser persönliche Link ist 30 Minuten gültig und kann einmal verwendet werden. Bitte nicht weitergeben.', footer: 'Sie erhalten diese E-Mail, weil ein Demo-Zugang angefragt wurde. Falls Sie das nicht waren, ignorieren Sie diese Nachricht.' },
  uk: { subject: 'Ваше персональне демо готове · Linden AI', title: 'Познайомтеся з вашим AI-адміністратором.', hello: 'Ваш доступ до демо Linden AI готовий.', button: 'Відкрити моє демо', note: 'Це персональне посилання діє 30 хвилин і працює лише один раз. Не діліться ним.', footer: 'Ви отримали цей лист після запиту доступу до демо. Якщо це були не ви, просто ігноруйте його.' },
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function accessEmail(input: AccessInput, token: string, origin: string) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) throw new AppError('mail_not_configured', 503);
  const link = new URL('/access', base.origin);
  link.searchParams.set('l', input.language);
  link.hash = new URLSearchParams({ token }).toString();
  const m = messages[input.language];
  const text = `${m.hello}\n\n${link.href}\n\n${m.note}\n\n${m.footer}`;
  const html = `<!doctype html><html lang="${input.language}"><body style="margin:0;background:#f4f6ef;font-family:Arial,sans-serif;color:#123f36"><div style="max-width:520px;margin:40px auto;padding:40px;background:#ffffff;border-radius:24px"><p style="font-size:22px;font-weight:bold">linden<span style="color:#5e8077"> / AI</span></p><h1 style="font-size:32px;line-height:1.2">${m.title}</h1><p style="line-height:1.6">${m.hello}</p><p style="margin:32px 0"><a href="${escapeHtml(link.href)}" style="background:#174e41;color:#fff;padding:16px 24px;border-radius:12px;text-decoration:none;display:inline-block">${m.button}</a></p><p style="font-size:13px;line-height:1.7;color:#5e716c">${m.note}</p><hr style="border:0;border-top:1px solid #e7ece7;margin:28px 0"><p style="font-size:12px;line-height:1.6;color:#5e716c">${m.footer}</p></div></body></html>`;
  return { subject: m.subject, text, html, link: link.href };
}

export async function sendAccessEmail(input: AccessInput & { id: string }, token: string, fetcher: typeof fetch = fetch) {
  const mail = accessEmail(input, token, process.env.APP_ORIGIN || 'http://localhost:3000');
  if (localMailEnabled()) {
    db().prepare('INSERT INTO mail(id,recipient,subject,body,created) VALUES (?,?,?,?,?)').run(input.id, input.email, mail.subject, mail.text, Date.now());
    return { mode: 'local', providerId: null };
  }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) throw new AppError('mail_not_configured', 503);
  try {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `demo-access/${input.id}` },
      body: JSON.stringify({ from: process.env.RESEND_FROM, to: [input.email], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(15_000),
    });
    const value = await response.json();
    if (!response.ok || typeof value.id !== 'string') throw new Error('send_failed');
    return { mode: 'resend', providerId: value.id as string };
  } catch { throw new AppError('mail_failed', 502); }
}
