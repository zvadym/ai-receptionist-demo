import { createHash, randomInt, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { query, transaction } from './db';
import { AppError } from './errors';
export type User = {
    id: string;
    name: string;
    email: string;
};
export const cookieName = 'linden_session';
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export async function rateLimit(bucket: string, max: number, windowMs: number) {
    const now = Date.now();
    const result = (await query("INSERT INTO rate_limits(bucket,count,expires) VALUES ($1,1,$2)\n    ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN rate_limits.expires<=$3 THEN 1 ELSE rate_limits.count+1 END,\n    expires=CASE WHEN rate_limits.expires<=$4 THEN excluded.expires ELSE rate_limits.expires END RETURNING count", [bucket, now + windowMs, now, now])).rows[0] as {
        count: number;
    };
    if (result.count > max)
        throw new AppError('rate_limited', 429);
}
export async function issueCode(email: string, name: string) {
    email = normalizeEmail(email);
    (await rateLimit(`email:${email}`, 4, 60 * 60000));
    const code = String(randomInt(100000, 1000000));
    // Salt each code, so identical six-digit codes do not have matching stored hashes.
    const salt = randomBytes(24).toString('hex');
    (await transaction(async () => {
        (await query("INSERT INTO users(id,email,name) VALUES ($1,$2,$3) ON CONFLICT(email) DO NOTHING", [randomUUID(), email, name]));
        (await query("INSERT INTO codes(email,hash,expires) VALUES ($1,$2,$3) ON CONFLICT(email)\n      DO UPDATE SET hash=excluded.hash, expires=excluded.expires, attempts=0", [email, `${salt}:${hash(salt + code)}`, Date.now() + 10 * 60000]));
    }));
    return code;
}
export async function verifyCode(email: string, code: string) {
    email = normalizeEmail(email);
    (await rateLimit(`verify:${email}`, 10, 15 * 60000));
    // Invalid attempts must commit, not roll back with a thrown transaction error.
    const result = (await transaction(async () => {
        const row = (await query("SELECT * FROM codes WHERE email=$1", [email])).rows[0] as {
            hash: string;
            expires: number;
            attempts: number;
        } | undefined;
        if (!row || row.expires <= Date.now() || row.attempts >= 5)
            return null;
        (await query("UPDATE codes SET attempts=attempts+1 WHERE email=$1", [email]));
        const [salt, expected] = row.hash.split(':');
        if (!timingSafeEqual(Buffer.from(hash(salt + code)), Buffer.from(expected)))
            return null;
        (await query("DELETE FROM codes WHERE email=$1", [email]));
        const user = (await query("SELECT * FROM users WHERE email=$1", [email])).rows[0] as User;
        const token = randomBytes(32).toString('hex');
        (await query("INSERT INTO sessions(hash,user_id,expires) VALUES ($1,$2,$3)", [hash(token), user.id, Date.now() + 7 * 86400000]));
        return { user, token };
    }));
    if (!result)
        throw new AppError('invalid_code', 401);
    return result;
}
export async function userForToken(token?: string): Promise<User | null> {
    if (!token)
        return null;
    return ((await query("SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=$1 AND expires>$2", [hash(token), Date.now()])).rows[0] as User) || null;
}
export async function revokeToken(token: string) { (await query("DELETE FROM sessions WHERE hash=$1", [hash(token)])); }
