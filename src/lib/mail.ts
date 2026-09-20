import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { db } from './db';
import type { Language } from './clinic';
import { AppError } from './errors';

export function localMailEnabled() { return process.env.NODE_ENV !== 'production' && (process.env.MAIL_MODE || 'local') === 'local'; }
export async function deliverCode(email: string, code: string, lang: Language) {
  const subject = { uk: 'Ваш код доступу · Linden Dental', de: 'Ihr Zugangscode · Linden Dental', en: 'Your access code · Linden Dental' }[lang];
  const text = { uk: `Ваш код: ${code}\n\nДіє 10 хвилин. Не діліться ним з іншими.\nЦе демонстраційний застосунок.`, de: `Ihr Code: ${code}\n\n10 Minuten gültig. Bitte nicht weitergeben.\nDies ist eine Demo-Anwendung.`, en: `Your code: ${code}\n\nValid for 10 minutes. Do not share it.\nThis is a demo application.` }[lang];
  if (localMailEnabled()) {
    db().prepare('INSERT INTO mail(id,recipient,subject,body,created) VALUES (?,?,?,?,?)').run(randomUUID(), email, subject, text, Date.now());
    return 'local';
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) throw new AppError('mail_not_configured', 503);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === '465',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 10_000, socketTimeout: 15_000,
  });
  try { await transport.sendMail({ from: process.env.SMTP_FROM, to: email, subject, text }); }
  catch { throw new AppError('mail_failed', 502); }
  finally { transport.close(); }
  return 'smtp';
}
