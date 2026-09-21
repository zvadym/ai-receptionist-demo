import { randomBytes, randomUUID } from 'node:crypto';
import { hash, normalizeEmail, type User } from './auth';
import { db } from './db';
import { AppError } from './errors';
import type { Language } from './clinic';

export type AccessInput = { name: string; email: string; clinic: string; language: Language };
export const accessLifetimeMs = 30 * 60_000;

export function issueAccess(input: AccessInput) {
  const request = { ...input, email: normalizeEmail(input.email), id: randomUUID() };
  const token = randomBytes(32).toString('hex');
  db().transaction(() => {
    db().prepare('INSERT INTO access_requests(id,email,name,clinic,language,created,send_status) VALUES (?,?,?,?,?,?,?)')
      .run(request.id, request.email, request.name, request.clinic, request.language, Date.now(), 'pending');
    db().prepare('DELETE FROM access_links WHERE email=?').run(request.email);
    db().prepare('INSERT INTO access_links(hash,request_id,email,expires) VALUES (?,?,?,?)')
      .run(hash(token), request.id, request.email, Date.now() + accessLifetimeMs);
  }).immediate();
  return { request, token };
}

export function markAccessSent(requestId: string, providerId: string | null) {
  db().prepare("UPDATE access_requests SET send_status='sent',provider_id=? WHERE id=?").run(providerId, requestId);
}

export function markAccessFailed(requestId: string) {
  db().transaction(() => {
    db().prepare("UPDATE access_requests SET send_status='failed' WHERE id=?").run(requestId);
    db().prepare('DELETE FROM access_links WHERE request_id=?').run(requestId);
  }).immediate();
}

export function redeemAccess(token: string) {
  return db().transaction(() => {
    const row = db().prepare(`SELECT access_requests.* FROM access_links JOIN access_requests ON access_requests.id=access_links.request_id
      WHERE access_links.hash=? AND access_links.expires>? AND access_requests.redeemed IS NULL AND access_requests.send_status='sent'`)
      .get(hash(token), Date.now()) as (AccessInput & { id: string }) | undefined;
    if (!row) throw new AppError('invalid_link', 401);
    db().prepare('DELETE FROM access_links WHERE hash=?').run(hash(token));
    db().prepare('UPDATE access_requests SET redeemed=? WHERE id=?').run(Date.now(), row.id);
    db().prepare('INSERT INTO users(id,email,name) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name')
      .run(randomUUID(), row.email, row.name);
    const user = db().prepare('SELECT * FROM users WHERE email=?').get(row.email) as User;
    const sessionToken = randomBytes(32).toString('hex');
    db().prepare('INSERT INTO sessions(hash,user_id,expires) VALUES (?,?,?)').run(hash(sessionToken), user.id, Date.now() + 7 * 86400_000);
    return { user, token: sessionToken, language: row.language };
  }).immediate();
}
