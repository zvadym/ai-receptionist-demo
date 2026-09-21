import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '../src/lib/db';
import { requestDeveloperCall } from '../src/lib/contact';

const folder = mkdtempSync(join(tmpdir(), 'linden-contact-'));
process.env.APP_DATA_DIR = folder;
process.env.MAIL_MODE = 'resend';
process.env.RESEND_API_KEY = 'test-key';
process.env.RESEND_FROM = 'Linden <demo@example.test>';
after(() => { db().close(); rmSync(folder, { recursive: true, force: true }); });
const input = { name: 'Contact Test', email: 'Contact@Example.test', message: 'Please discuss our calendar integration.', language: 'en', website: '' };

test('contact persists before notification and sends to the developer with visitor reply-to', async () => {
  const result = await requestDeveloperCall(input, (async (_url, options) => {
    const row = db().prepare('SELECT * FROM contact_requests WHERE email=?').get('contact@example.test') as Record<string, unknown>;
    assert.equal(row.send_status, 'pending');
    assert.equal(row.message, input.message);
    assert.equal(new Headers(options?.headers).get('Idempotency-Key'), `developer-call/${row.id}`);
    const mail = JSON.parse(String(options?.body));
    assert.deepEqual(mail.to, ['contact@example.test']);
    assert.equal(mail.reply_to, 'contact@example.test');
    assert.ok(mail.text.includes(input.message));
    return Response.json({ id: 'contact-provider-id' });
  }) as typeof fetch);
  assert.deepEqual(result, { saved: true, mailMode: 'resend' });
  const row = db().prepare('SELECT send_status,provider_id FROM contact_requests').get();
  assert.deepEqual(row, { send_status: 'sent', provider_id: 'contact-provider-id' });
});

test('provider failures retain the request and do not expose provider errors', async () => {
  await assert.rejects(requestDeveloperCall({ ...input, email: 'failed@example.test' }, (async () => Response.json({ message: 'private provider detail' }, { status: 403 })) as typeof fetch), /contact_delivery_failed/);
  assert.equal((db().prepare('SELECT send_status FROM contact_requests WHERE email=?').get('failed@example.test') as { send_status: string }).send_status, 'failed');
});

test('invalid input and honeypot do not persist; repeated requests are limited', async () => {
  const before = (db().prepare('SELECT count(*) AS total FROM contact_requests').get() as { total: number }).total;
  const unexpectedFetch = (async () => { throw new Error('must not send'); }) as typeof fetch;
  for (const change of [{ email: 'invalid' }, { name: ' ' }, { message: 'tiny' }, { website: 'spam' }, { message: 'x'.repeat(2001) }]) {
    await assert.rejects(requestDeveloperCall({ ...input, ...change }, unexpectedFetch));
  }
  assert.equal((db().prepare('SELECT count(*) AS total FROM contact_requests').get() as { total: number }).total, before);
  const accepted = (async () => Response.json({ id: 'rate-test' })) as typeof fetch;
  for (let i = 0; i < 3; i++) await requestDeveloperCall({ ...input, email: 'limit@example.test' }, accepted);
  await assert.rejects(requestDeveloperCall({ ...input, email: 'limit@example.test' }, unexpectedFetch), /rate_limited/);
});
