import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { query, closeDb } from '../src/lib/db';
import { hash, userForToken } from '../src/lib/auth';
import { issueAccess, markAccessSent, markAccessFailed, redeemAccess } from '../src/lib/access-links';
import { accessEmail, sendAccessEmail } from '../src/lib/access-mail';
import { resolveLanguage } from '../src/lib/locale';
const folder = mkdtempSync(join(tmpdir(), 'linden-access-'));
process.env.APP_DATA_DIR = folder;
after(async () => { (await closeDb()); rmSync(folder, { recursive: true, force: true }); });
const input = { name: 'Access Test', email: 'Access@Example.test', clinic: 'Test Clinic', language: 'de' as const };
test('requests persist before delivery, tokens are hashed and single use; redemption creates authenticated session', async () => {
    const { request, token } = (await issueAccess(input));
    const record = (await query("SELECT * FROM access_requests WHERE id=$1", [request.id])).rows[0] as Record<string, unknown>;
    assert.equal(record.send_status, 'pending');
    assert.equal(record.clinic, 'Test Clinic');
    assert.equal(record.email, 'access@example.test');
    const link = (await query("SELECT * FROM access_links WHERE request_id=$1", [request.id])).rows[0] as {
        hash: string;
    };
    assert.equal(link.hash, hash(token));
    assert.notEqual(link.hash, token);
    (await assert.rejects(async () => (await redeemAccess(token)), /invalid_link/));
    (await markAccessSent(request.id, 'email-1'));
    const result = (await redeemAccess(token));
    assert.equal(result.language, 'de');
    assert.equal(result.user.name, input.name);
    assert.equal((await userForToken(result.token))?.id, result.user.id);
    (await assert.rejects(async () => (await redeemAccess(token)), /invalid_link/));
    assert.ok(((await query("SELECT redeemed FROM access_requests WHERE id=$1", [request.id])).rows[0] as {
        redeemed: number;
    }).redeemed);
});
test('new requests revoke older links; failed delivery does not remove a newer request; expired links fail', async () => {
    const old = (await issueAccess(input));
    (await markAccessSent(old.request.id, 'old'));
    const fresh = (await issueAccess(input));
    (await markAccessSent(fresh.request.id, 'fresh'));
    (await markAccessFailed(old.request.id));
    (await assert.rejects(async () => (await redeemAccess(old.token)), /invalid_link/));
    assert.equal((await redeemAccess(fresh.token)).user.email, 'access@example.test');
    const expired = (await issueAccess(input));
    (await markAccessSent(expired.request.id, 'expired'));
    (await query("UPDATE access_links SET expires=0 WHERE request_id=$1", [expired.request.id]));
    (await assert.rejects(async () => (await redeemAccess(expired.token)), /invalid_link/));
    const failed = (await issueAccess(input));
    (await markAccessFailed(failed.request.id));
    (await assert.rejects(async () => (await redeemAccess(failed.token)), /invalid_link/));
    assert.equal(((await query("SELECT send_status FROM access_requests WHERE id=$1", [failed.request.id])).rows[0] as {
        send_status: string;
    }).send_status, 'failed');
});
test('localized email uses a fixed origin and fragment token, not a server-visible query credential', () => {
    for (const language of ['en', 'de', 'uk'] as const) {
        const message = accessEmail({ ...input, language }, 'a'.repeat(64), 'https://demo.example.test/untrusted/path?q=x');
        const url = new URL(message.link);
        assert.equal(url.origin, 'https://demo.example.test');
        assert.equal(url.pathname, '/access');
        assert.equal(url.search, `?l=${language}`);
        assert.equal(url.hash, `#token=${'a'.repeat(64)}`);
        assert.ok(message.html.includes(`lang="${language}"`));
        assert.ok(message.text.includes(message.link));
    }
    assert.throws(() => accessEmail(input, 'x', 'http://external.example.test'), /mail_not_configured/);
    assert.equal(resolveLanguage(), 'en');
    assert.equal(resolveLanguage('de'), 'de');
    assert.equal(resolveLanguage('ua'), 'uk');
    assert.equal(resolveLanguage('fr'), 'en');
});
test('Resend uses request idempotency and records acceptance; provider rejection is sanitized', async () => {
    const saved = { ...process.env };
    process.env.MAIL_MODE = 'resend';
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM = 'Linden <demo@example.test>';
    process.env.APP_ORIGIN = 'https://demo.example.test';
    try {
        const issued = (await issueAccess(input));
        const result = await sendAccessEmail(issued.request, issued.token, (async (url, options) => {
            assert.equal(url, 'https://api.resend.com/emails');
            assert.equal(new Headers(options?.headers).get('Idempotency-Key'), `demo-access/${issued.request.id}`);
            const body = JSON.parse(String(options?.body));
            assert.deepEqual(body.to, ['access@example.test']);
            assert.ok(body.text.includes('/access?l=de#token='));
            return Response.json({ id: 'provider-123' });
        }) as typeof fetch);
        assert.deepEqual(result, { mode: 'resend', providerId: 'provider-123' });
        await assert.rejects(sendAccessEmail(issued.request, issued.token, (async () => Response.json({ message: 'secret provider detail' }, { status: 403 })) as typeof fetch), /mail_failed/);
        delete process.env.RESEND_FROM;
        await assert.rejects(sendAccessEmail(issued.request, issued.token), /mail_not_configured/);
    }
    finally {
        for (const key of ['MAIL_MODE', 'RESEND_API_KEY', 'RESEND_FROM', 'APP_ORIGIN']) {
            if (saved[key] === undefined)
                delete process.env[key];
            else
                process.env[key] = saved[key];
        }
    }
});
