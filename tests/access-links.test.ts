import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '../src/lib/db';
import { hash, userForToken } from '../src/lib/auth';
import { issueAccess, markAccessSent, markAccessFailed, redeemAccess } from '../src/lib/access-links';
import { accessEmail, sendAccessEmail } from '../src/lib/access-mail';
import { resolveLanguage } from '../src/lib/locale';

const folder = mkdtempSync(join(tmpdir(), 'linden-access-'));
process.env.APP_DATA_DIR = folder;
after(() => { db().close(); rmSync(folder, { recursive: true, force: true }); });
const input = { name: 'Access Test', email: 'Access@Example.test', clinic: 'Test Clinic', language: 'de' as const };

test('requests persist before delivery, tokens are hashed and single use; redemption creates authenticated session', () => {
  const { request, token } = issueAccess(input);
  const record = db().prepare('SELECT * FROM access_requests WHERE id=?').get(request.id) as Record<string, unknown>;
  assert.equal(record.send_status, 'pending'); assert.equal(record.clinic, 'Test Clinic'); assert.equal(record.email, 'access@example.test');
  const link = db().prepare('SELECT * FROM access_links WHERE request_id=?').get(request.id) as { hash: string };
  assert.equal(link.hash, hash(token)); assert.notEqual(link.hash, token);
  assert.throws(() => redeemAccess(token), /invalid_link/);
  markAccessSent(request.id, 'email-1');
  const result = redeemAccess(token);
  assert.equal(result.language, 'de'); assert.equal(result.user.name, input.name);
  assert.equal(userForToken(result.token)?.id, result.user.id);
  assert.throws(() => redeemAccess(token), /invalid_link/);
  assert.ok((db().prepare('SELECT redeemed FROM access_requests WHERE id=?').get(request.id) as { redeemed: number }).redeemed);
});

test('new requests revoke older links; failed delivery does not remove a newer request; expired links fail', () => {
  const old = issueAccess(input); markAccessSent(old.request.id, 'old');
  const fresh = issueAccess(input); markAccessSent(fresh.request.id, 'fresh');
  markAccessFailed(old.request.id);
  assert.throws(() => redeemAccess(old.token), /invalid_link/);
  assert.equal(redeemAccess(fresh.token).user.email, 'access@example.test');
  const expired = issueAccess(input); markAccessSent(expired.request.id, 'expired');
  db().prepare('UPDATE access_links SET expires=0 WHERE request_id=?').run(expired.request.id);
  assert.throws(() => redeemAccess(expired.token), /invalid_link/);
  const failed = issueAccess(input); markAccessFailed(failed.request.id);
  assert.throws(() => redeemAccess(failed.token), /invalid_link/);
  assert.equal((db().prepare('SELECT send_status FROM access_requests WHERE id=?').get(failed.request.id) as { send_status: string }).send_status, 'failed');
});

test('localized email uses a fixed origin and fragment token, not a server-visible query credential', () => {
  for (const language of ['en', 'de', 'uk'] as const) {
    const message = accessEmail({ ...input, language }, 'a'.repeat(64), 'https://demo.example.test/untrusted/path?q=x');
    const url = new URL(message.link);
    assert.equal(url.origin, 'https://demo.example.test'); assert.equal(url.pathname, '/access');
    assert.equal(url.search, `?l=${language}`); assert.equal(url.hash, `#token=${'a'.repeat(64)}`);
    assert.ok(message.html.includes(`lang="${language}"`)); assert.ok(message.text.includes(message.link));
  }
  assert.throws(() => accessEmail(input, 'x', 'http://external.example.test'), /mail_not_configured/);
  assert.equal(resolveLanguage(), 'en'); assert.equal(resolveLanguage('de'), 'de'); assert.equal(resolveLanguage('ua'), 'uk'); assert.equal(resolveLanguage('fr'), 'en');
});

test('Resend uses request idempotency and records acceptance; provider rejection is sanitized', async () => {
  const saved = { ...process.env };
  process.env.MAIL_MODE = 'resend'; process.env.RESEND_API_KEY = 'test-key'; process.env.RESEND_FROM = 'Linden <demo@example.test>'; process.env.APP_ORIGIN = 'https://demo.example.test';
  try {
    const issued = issueAccess(input);
    const result = await sendAccessEmail(issued.request, issued.token, (async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(new Headers(options?.headers).get('Idempotency-Key'), `demo-access/${issued.request.id}`);
      const body = JSON.parse(String(options?.body)); assert.deepEqual(body.to, ['access@example.test']);
      assert.ok(body.text.includes('/access?l=de#token='));
      return Response.json({ id: 'provider-123' });
    }) as typeof fetch);
    assert.deepEqual(result, { mode: 'resend', providerId: 'provider-123' });
    await assert.rejects(sendAccessEmail(issued.request, issued.token, (async () => Response.json({ message: 'secret provider detail' }, { status: 403 })) as typeof fetch), /mail_failed/);
    delete process.env.RESEND_FROM;
    await assert.rejects(sendAccessEmail(issued.request, issued.token), /mail_not_configured/);
  } finally {
    for (const key of ['MAIL_MODE', 'RESEND_API_KEY', 'RESEND_FROM', 'APP_ORIGIN']) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});
