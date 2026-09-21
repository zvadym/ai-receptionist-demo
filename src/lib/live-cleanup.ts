import WebSocket from 'ws';
import { query } from './db';

// Use the documented sideband close protocol for WebRTC. The HTTP hangup
// endpoint is documented for SIP, so it is not used for browser sessions.
export function closeProviderSession(providerId: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`wss://api.openai.com/v1/live/sessions/${encodeURIComponent(providerId)}/attach`, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, handshakeTimeout: 8_000,
    });
    let settled = false;
    const finish = (error?: Error, usage?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.close();
      setTimeout(() => { if (socket.readyState !== WebSocket.CLOSED) socket.terminate(); }, 500).unref();
      if (error) reject(error); else resolve(usage);
    };
    const timeout = setTimeout(() => finish(new Error('Finalization unconfirmed')), 12_000);
    socket.on('open', () => socket.send(JSON.stringify({ type: 'session.close' })));
    socket.on('message', raw => {
      try {
        const event = JSON.parse(raw.toString());
        if (event.type === 'session.closed') finish(undefined, event.usage || null);
      } catch { /* Ignore malformed provider events. */ }
    });
    socket.on('error', () => finish(new Error('Finalization unconfirmed')));
    socket.on('close', () => finish(new Error('Finalization unconfirmed')));
  });
}

export async function reconcileVoiceSessions(close = closeProviderSession) {
  // Provider-issued expiry is authoritative even when final usage could not be retrieved.
  // Keep an explicit expired state rather than claim a confirmed session.closed.
  const expired = (await query("UPDATE voice_sessions SET state='expired' WHERE state IN ('starting','active','closing','incomplete') AND expires_at<=$1 RETURNING id", [Date.now()])).rows.length;
  const stale = (await query<{ id: string; provider_id: string | null }>(
    "SELECT id,provider_id FROM voice_sessions WHERE state IN ('starting','active','closing','incomplete') AND created<$1 ORDER BY created LIMIT 20",
    [Date.now() - 330_000],
  )).rows;
  let closed = 0, unconfirmed = 0;
  // Bound concurrency to avoid opening all sidebands at once after an outage.
  for (let i = 0; i < stale.length; i += 4) {
    await Promise.all(stale.slice(i, i + 4).map(async row => {
      if (!row.provider_id) {
        await query("UPDATE voice_sessions SET state='failed' WHERE id=$1 AND provider_id IS NULL", [row.id]);
        return;
      }
      try {
        const usage = await close(row.provider_id);
        await query("UPDATE voice_sessions SET state='closed',usage=$1 WHERE id=$2 AND state!='closed'", [JSON.stringify(usage), row.id]);
        closed++;
      } catch {
        await query("UPDATE voice_sessions SET state='incomplete' WHERE id=$1 AND state!='closed'", [row.id]);
        unconfirmed++;
      }
    }));
  }
  return { examined: stale.length, closed, unconfirmed, expired };
}
