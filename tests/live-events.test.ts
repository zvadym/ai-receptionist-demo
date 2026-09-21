import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveToolRouter, type WireEvent } from '../src/lib/live-events';
const envelope = (event: object, delegation_id = 'd1') => ({ type: 'response.event', delegation_id, event });
const created = (id = 'r1') => ({ type: 'response.created', response: { id } });
const call = (id: string, name = 'find_available_slots') => ({ type: 'response.output_item.done', item: { type: 'function_call', call_id: id, name, arguments: '{}' } });
test('all tool outputs precede continuation despite empty completed output', async () => {
    const sent: WireEvent[] = [], executed: string[] = [];
    const router = new LiveToolRouter(e => sent.push(e), c => { executed.push(c.call_id); return '{"ok":true}'; });
    await router.receive(envelope(created()));
    await router.receive(envelope((await call('a'))));
    await router.receive(envelope((await call('b'))));
    assert.equal(sent.length, 0);
    await router.receive(envelope({ type: 'response.completed', response: { id: 'r1', output: [] } }));
    assert.deepEqual(executed, ['a', 'b']);
    assert.deepEqual(sent.map(e => e.type), ['response.item.create', 'response.item.create', 'response.create']);
    await router.receive(envelope({ type: 'response.completed', response: { id: 'r1' } }));
    assert.equal(sent.length, 3);
});
test('failed responses never mutate; interleaved delegations remain distinct', async () => {
    const calls: string[] = [];
    const router = new LiveToolRouter(() => { }, c => { calls.push(c.call_id); return '{}'; });
    await router.receive(envelope(created('r1'), 'd1'));
    await router.receive(envelope(created('r2'), 'd2'));
    await router.receive(envelope((await call('a')), 'd1'));
    await router.receive(envelope((await call('b')), 'd2'));
    await router.receive(envelope({ type: 'response.failed', response: { id: 'r1' } }, 'd1'));
    await router.receive(envelope({ type: 'response.completed', response: { id: 'r2', output: [] } }, 'd2'));
    assert.deepEqual(calls, ['b']);
});
test('prepare and confirmation in one backend response cannot auto-commit', async () => {
    const calls: string[] = [];
    const sent: WireEvent[] = [];
    const router = new LiveToolRouter(e => sent.push(e), c => { calls.push(c.name); return '{}'; });
    await router.receive(envelope(created()));
    await router.receive(envelope((await call('a', 'prepare_booking'))));
    await router.receive(envelope((await call('b', 'confirm_booking_change'))));
    await router.receive(envelope({ type: 'response.completed', response: { id: 'r1' } }));
    assert.deepEqual(calls, ['prepare_booking']);
    assert.match(JSON.stringify(sent), /Separate user confirmation/);
});
test('a tool-loop continuation cannot confirm without a new delegation', async () => {
    const calls: string[] = [];
    const router = new LiveToolRouter(() => { }, c => { calls.push(c.name); return '{}'; });
    for (const [id, delegation, tool] of [['r1', 'd1', 'prepare_booking'], ['r2', 'd1', 'confirm_booking_change'], ['r3', 'd2', 'confirm_booking_change']]) {
        await router.receive(envelope(created(id), delegation));
        await router.receive(envelope((await call(id, tool)), delegation));
        await router.receive(envelope({ type: 'response.completed', response: { id } }, delegation));
        if (id === 'r2')
            assert.deepEqual(calls, ['prepare_booking']);
    }
    assert.deepEqual(calls, ['prepare_booking', 'confirm_booking_change']);
});
