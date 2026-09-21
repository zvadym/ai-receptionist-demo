import { randomBytes, randomUUID } from 'node:crypto';
import { hash, normalizeEmail, type User } from './auth';
import { query, transaction } from './db';
import { AppError } from './errors';
import type { Language } from './clinic';
export type AccessInput = {
    name: string;
    email: string;
    clinic: string;
    language: Language;
};
export const accessLifetimeMs = 30 * 60000;
export async function issueAccess(input: AccessInput) {
    const request = { ...input, email: normalizeEmail(input.email), id: randomUUID() };
    const token = randomBytes(32).toString('hex');
    (await transaction(async () => {
        (await query("INSERT INTO access_requests(id,email,name,clinic,language,created,send_status) VALUES ($1,$2,$3,$4,$5,$6,$7)", [request.id, request.email, request.name, request.clinic, request.language, Date.now(), 'pending']));
        (await query("DELETE FROM access_links WHERE email=$1", [request.email]));
        (await query("INSERT INTO access_links(hash,request_id,email,expires) VALUES ($1,$2,$3,$4)", [hash(token), request.id, request.email, Date.now() + accessLifetimeMs]));
    }));
    return { request, token };
}
export async function markAccessSent(requestId: string, providerId: string | null) {
    (await query("UPDATE access_requests SET send_status='sent',provider_id=$1 WHERE id=$2", [providerId, requestId]));
}
export async function markAccessFailed(requestId: string) {
    (await transaction(async () => {
        (await query("UPDATE access_requests SET send_status='failed' WHERE id=$1", [requestId]));
        (await query("DELETE FROM access_links WHERE request_id=$1", [requestId]));
    }));
}
export async function redeemAccess(token: string) {
    return (await transaction(async () => {
        const row = (await query("SELECT access_requests.* FROM access_links JOIN access_requests ON access_requests.id=access_links.request_id\n      WHERE access_links.hash=$1 AND access_links.expires>$2 AND access_requests.redeemed IS NULL AND access_requests.send_status='sent'", [hash(token), Date.now()])).rows[0] as (AccessInput & {
            id: string;
        }) | undefined;
        if (!row)
            throw new AppError('invalid_link', 401);
        (await query("DELETE FROM access_links WHERE hash=$1", [hash(token)]));
        (await query("UPDATE access_requests SET redeemed=$1 WHERE id=$2", [Date.now(), row.id]));
        (await query("INSERT INTO users(id,email,name) VALUES ($1,$2,$3) ON CONFLICT(email) DO UPDATE SET name=excluded.name", [randomUUID(), row.email, row.name]));
        const user = (await query("SELECT * FROM users WHERE email=$1", [row.email])).rows[0] as User;
        const sessionToken = randomBytes(32).toString('hex');
        (await query("INSERT INTO sessions(hash,user_id,expires) VALUES ($1,$2,$3)", [hash(sessionToken), user.id, Date.now() + 7 * 86400000]));
        return { user, token: sessionToken, language: row.language };
    }));
}
