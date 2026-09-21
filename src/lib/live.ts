import WebSocket from 'ws';
import { waitUntil } from '@vercel/functions';
import { defaultVoice, type Voice } from './voices';
import { randomUUID } from 'node:crypto';
import { query, transaction } from './db';
import type { Language } from './clinic';
import { createAgentPrompts } from './agent-prompts';
import { type User, rateLimit } from './auth';
import { AppError } from './errors';
import { toolDefinitions, executeTool } from './tools';
import { LiveToolRouter, type WireEvent } from './live-events';
export const voiceSeconds = 300;
export async function reserveVoice(user: User) {
    return (await transaction(async () => {
        const active = (await query("SELECT id FROM voice_sessions WHERE user_id=$1 AND state IN ('starting','active','closing','incomplete')", [user.id])).rows[0];
        if (active)
            throw new AppError('voice_already_active', 409);
        (await rateLimit(`voice:${user.id}`, 3, 86400000));
        (await rateLimit('voice:global', 20, 86400000));
        const id = randomUUID();
        (await query("INSERT INTO voice_sessions(id,user_id,state,created) VALUES ($1,$2,'starting',$3)", [id, user.id, Date.now()]));
        return id;
    }));
}
export function voiceSessionConfig(user: User, language: Language, voice: Voice = defaultVoice) {
    const { instructions, backend } = createAgentPrompts(user, language);
    return { model: 'gpt-live-1', instructions, audio: { output: { voice } }, delegation: { type: 'responses', responses: { model: process.env.LIVE_BACKEND_MODEL || 'gpt-5.6-terra', instructions: backend, reasoning: { effort: 'low' }, tools: toolDefinitions, tool_choice: 'auto', parallel_tool_calls: false } } };
}
export async function startVoice(user: User, language: Language, sdp: string, requestSignal: AbortSignal, voice: Voice = defaultVoice) {
    const key = process.env.OPENAI_API_KEY;
    if (!key)
        throw new AppError('voice_not_configured', 503);
    const id = (await reserveVoice(user));
    const startedAt = Date.now();
    let providerId: string | undefined;
    let socket: WebSocket | undefined;
    try {
        const response = await fetch('https://api.openai.com/v1/live/sessions', {
            method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ session: voiceSessionConfig(user, language, voice), transport: { type: 'webrtc', sdp } }),
            signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) {
            console.error('Live session creation HTTP status:', response.status);
            throw new AppError(response.status === 401 || response.status === 403 ? 'voice_access_denied' : 'voice_failed', 502);
        }
        const result = await response.json();
        if (typeof result.session?.id !== 'string' || typeof result.transport?.sdp !== 'string')
            throw new AppError('voice_failed', 502);
        providerId = result.session.id;
        (await query("UPDATE voice_sessions SET provider_id=$1,expires_at=$2 WHERE id=$3", [providerId, typeof result.session.expires_at === 'number' ? result.session.expires_at * 1000 : null, id]));
        socket = new WebSocket(`wss://api.openai.com/v1/live/sessions/${encodeURIComponent(providerId!)}/attach`, { headers: { Authorization: `Bearer ${key}` }, handshakeTimeout: 10000 });
        const ws = socket;
        // Install the receiver before awaiting open so early events cannot be lost.
        const backlog: WireEvent[] = [];
        let receiver: (event: WireEvent) => void | Promise<void> = event => { backlog.push(event); };
        let events = Promise.resolve();
        ws.on('message', raw => {
            let event: WireEvent;
            try {
                event = JSON.parse(raw.toString());
            }
            catch {
                return;
            }
            events = events.then(() => receiver(event)).catch(() => { ws.emit('error', new Error('Live event processing failed')); });
        });
        await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
        (await query("UPDATE voice_sessions SET state='active' WHERE id=$1", [id]));
        let controller: ReadableStreamDefaultController<Uint8Array>;
        let ended = false;
        let closing = false;
        let streamGone = false;
        let deadline: ReturnType<typeof setTimeout>;
        let closeDeadline: ReturnType<typeof setTimeout> | undefined;
        let heartbeat: ReturnType<typeof setInterval>;
        const encoder = new TextEncoder();
        const emit = (event: unknown) => {
            if (streamGone || !controller)
                return;
            try {
                controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
            }
            catch {
                streamGone = true;
            }
        };
        let resolveFinished!: () => void;
        const finished = new Promise<void>(resolve => { resolveFinished = resolve; });
        if (process.env.VERCEL) waitUntil(finished);
        const finish = async (complete: boolean, usage?: unknown) => {
            if (ended)
                return;
            ended = true;
            clearTimeout(deadline);
            clearTimeout(closeDeadline);
            clearInterval(heartbeat);
            requestSignal.removeEventListener('abort', onAbort);
            try {
                await query("UPDATE voice_sessions SET state=$1,usage=$2 WHERE id=$3 AND state!='closed'", [complete ? 'closed' : 'incomplete', JSON.stringify(usage ?? null), id]);
            } catch { console.error('Voice finalization persistence failed'); }
            resolveFinished();
            emit({ type: 'closed', complete });
            if (!streamGone) {
                try {
                    controller.close();
                }
                catch { }
            }
            streamGone = true;
            ws.close();
            setTimeout(() => { if (ws.readyState !== WebSocket.CLOSED)
                ws.terminate(); }, 1000).unref();
        };
        const close = async () => {
            if (closing || ended)
                return;
            closing = true;
            if (ws.readyState === WebSocket.OPEN)
                ws.send(JSON.stringify({ type: 'session.close' }));
            closeDeadline = setTimeout(() => { void finish(false); }, 8000);
            try { await query("UPDATE voice_sessions SET state='closing' WHERE id=$1 AND state='active'", [id]); } catch { console.error('Voice close persistence failed'); }
        };
        const onAbort = () => { streamGone = true; close(); };
        const send = (event: WireEvent) => { if (!closing && ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify(event)); };
        const router = new LiveToolRouter(send, async (call) => {
            const result = (await executeTool(user.id, id, call.call_id, call.name, call.arguments));
            emit({ type: 'state_changed' });
            return result;
        });
        return new Response(new ReadableStream<Uint8Array>({
            start(c) {
                controller = c;
                emit({ type: 'setup', sdp: result.transport.sdp, sessionId: id, seconds: voiceSeconds });
                receiver = async event => {
                    const session = event.session as { expires_at?: number } | undefined;
                    if (event.type === 'session.started' && typeof session?.expires_at === 'number') {
                        await query('UPDATE voice_sessions SET expires_at=$1 WHERE id=$2', [session.expires_at * 1000, id]);
                    }
                    if (event.type === 'session.closed') {
                        await finish(true, event.usage || event);
                        return;
                    }
                    if (event.type === 'error') {
                        emit({ type: 'error', error: 'voice_failed' });
                        await close();
                        return;
                    }
                    if (!closing)
                        await router.receive(event);
                };
                deadline = setTimeout(close, Math.max(1, voiceSeconds * 1000 - (Date.now() - startedAt)));
                heartbeat = setInterval(() => emit({ type: 'heartbeat' }), 10000);
                ws.on('close', () => finish(false));
                ws.on('error', () => { emit({ type: 'error', error: 'voice_failed' }); finish(false); });
                requestSignal.addEventListener('abort', onAbort, { once: true });
                for (const event of backlog)
                    events = events.then(() => receiver(event)).catch(() => { void close(); });
                if (requestSignal.aborted)
                    onAbort();
            },
            cancel() { streamGone = true; close(); },
        }), { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store, no-transform', 'X-Content-Type-Options': 'nosniff' } });
    }
    catch (error) {
        // A created provider session whose sideband failed to attach has uncertain finalization.
        (await query("UPDATE voice_sessions SET state=$1 WHERE id=$2", [providerId ? 'incomplete' : 'failed', id]));
        if (socket?.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify({ type: 'session.close' }));
        socket?.close();
        if (error instanceof AppError)
            throw error;
        throw new AppError('voice_failed', 502);
    }
}
