import { createHash, randomInt, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { db } from './db';
import { AppError } from './errors';

export type User = { id: string; name: string; email: string };
export const cookieName = 'linden_session';
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function rateLimit(bucket: string, max: number, windowMs: number) {
  const now = Date.now();
  const result = db().prepare(`INSERT INTO rate_limits(bucket,count,expires) VALUES (?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,
    expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count`).get(bucket, now + windowMs, now, now) as { count: number };
  if (result.count > max) throw new AppError('rate_limited', 429);
}

export function issueCode(email: string, name: string) {
  email = normalizeEmail(email);
  rateLimit(`email:${email}`, 4, 60 * 60_000);
  const code = String(randomInt(100000, 1000000));
  // Salt each code, so identical six-digit codes do not have matching stored hashes.
  const salt = randomBytes(24).toString('hex');
  db().transaction(() => {
    db().prepare('INSERT INTO users(id,email,name) VALUES (?,?,?) ON CONFLICT(email) DO NOTHING').run(randomUUID(), email, name);
    db().prepare(`INSERT INTO codes(email,hash,expires) VALUES (?,?,?) ON CONFLICT(email)
      DO UPDATE SET hash=excluded.hash, expires=excluded.expires, attempts=0`).run(email, `${salt}:${hash(salt + code)}`, Date.now() + 10 * 60_000);
  })();
  return code;
}

export function verifyCode(email: string, code: string) {
  email = normalizeEmail(email);
  rateLimit(`verify:${email}`, 10, 15 * 60_000);
  // Invalid attempts must commit, not roll back with a thrown transaction error.
  const result = db().transaction(() => {
    const row = db().prepare('SELECT * FROM codes WHERE email=?').get(email) as { hash: string; expires: number; attempts: number } | undefined;
    if (!row || row.expires <= Date.now() || row.attempts >= 5) return null;
    db().prepare('UPDATE codes SET attempts=attempts+1 WHERE email=?').run(email);
    const [salt, expected] = row.hash.split(':');
    if (!timingSafeEqual(Buffer.from(hash(salt + code)), Buffer.from(expected))) return null;
    db().prepare('DELETE FROM codes WHERE email=?').run(email);
    const user = db().prepare('SELECT * FROM users WHERE email=?').get(email) as User;
    const token = randomBytes(32).toString('hex');
    db().prepare('INSERT INTO sessions(hash,user_id,expires) VALUES (?,?,?)').run(hash(token), user.id, Date.now() + 7 * 86400_000);
    return { user, token };
  })();
  if (!result) throw new AppError('invalid_code', 401);
  return result;
}

export function userForToken(token?: string): User | null {
  if (!token) return null;
  return (db().prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=? AND expires>?').get(hash(token), Date.now()) as User) || null;
}

export function revokeToken(token: string) { db().prepare('DELETE FROM sessions WHERE hash=?').run(hash(token)); }
