'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { Language } from '@/lib/clinic';
import { greetingCommand } from '@/lib/live-events';

type Transcript = { speaker: 'user' | 'assistant'; text: string };
type Resources = { peer?: RTCPeerConnection; channel?: RTCDataChannel; mic?: MediaStream; audio?: HTMLAudioElement; abort?: AbortController; timer?: ReturnType<typeof setInterval>; closingTimer?: ReturnType<typeof setTimeout>; connectedTimer?: ReturnType<typeof setTimeout> };
export function useVoice(onChange: () => void) {
  const [status, setStatus] = useState<'idle'|'connecting'|'active'|'closing'>('idle');
  const [transcript, setTranscript] = useState<Transcript[]>([]);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState(300);
  const [muted, setMuted] = useState(false);
  const resources = useRef<Resources>({});
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const cleanup = useCallback(() => {
    const r = resources.current;
    clearInterval(r.timer); clearTimeout(r.closingTimer); clearTimeout(r.connectedTimer);
    r.mic?.getTracks().forEach(t => t.stop());
    r.channel?.close(); r.peer?.close(); r.abort?.abort();
    if (r.audio) { r.audio.pause(); r.audio.srcObject = null; }
    resources.current = {};
  }, []);
  useEffect(() => () => cleanup(), [cleanup]);

  function stop() {
    const r = resources.current;
    // getUserMedia may wait indefinitely for a permission dialog. No paid session exists yet.
    if (!r.peer) { cleanup(); setStatus('idle'); return; }
    setStatus('closing');
    r.mic?.getTracks().forEach(t => { t.enabled = false; });
    if (r.channel?.readyState === 'open') r.channel.send(JSON.stringify({ type: 'session.close' }));
    else r.abort?.abort();
    r.closingTimer = setTimeout(() => { cleanup(); setStatus('idle'); setError('incomplete_close'); onChangeRef.current(); }, 10_000);
  }
  function toggleMute() {
    const next = !muted;
    resources.current.mic?.getTracks().forEach(t => { t.enabled = !next; });
    setMuted(next);
  }
  async function start(language: Language) {
    if (resources.current.abort) return;
    setStatus('connecting'); setError(''); setTranscript([]); setRemaining(300); setMuted(false);
    const r: Resources = { abort: new AbortController() };
    resources.current = r;
    let completed = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('microphone_denied');
      try { r.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }); }
      catch { throw new Error('microphone_denied'); }
      if (r.abort!.signal.aborted) { r.mic.getTracks().forEach(t => t.stop()); return; }
      const peer = r.peer = new RTCPeerConnection();
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed') { setError('voice_failed'); r.abort?.abort(); }
      };
      r.audio = new Audio(); r.audio.autoplay = true;
      peer.ontrack = e => { r.audio!.srcObject = e.streams[0] || new MediaStream([e.track]); void r.audio!.play().catch(() => setError('voice_failed')); };
      r.mic.getTracks().forEach(t => peer.addTrack(t, r.mic!));
      const channel = r.channel = peer.createDataChannel('oai-events');
      channel.onmessage = message => {
        let event;
        try { event = JSON.parse(message.data); } catch { return; }
        if (event.type === 'session.started') {
          clearTimeout(r.connectedTimer); setStatus('active');
          channel.send(JSON.stringify(greetingCommand(language)));
          const end = Date.now() + 300_000;
          r.timer = setInterval(() => setRemaining(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 1000);
        }
        if (event.type === 'session.input_transcript.delta' || event.type === 'session.output_transcript.delta') {
          const speaker = event.type === 'session.input_transcript.delta' ? 'user' : 'assistant';
          setTranscript(previous => {
            const last = previous.at(-1);
            return last?.speaker === speaker ? [...previous.slice(0, -1), { speaker, text: last.text + event.delta }] : [...previous, { speaker, text: event.delta }];
          });
        }
      };
      await peer.setLocalDescription(await peer.createOffer());
      await new Promise<void>((resolve, reject) => {
        if (peer.iceGatheringState === 'complete') { resolve(); return; }
        const timeout = setTimeout(() => { peer.removeEventListener('icegatheringstatechange', listener); reject(new Error('voice_failed')); }, 10_000);
        const listener = () => { if (peer.iceGatheringState === 'complete') { clearTimeout(timeout); peer.removeEventListener('icegatheringstatechange', listener); resolve(); } };
        peer.addEventListener('icegatheringstatechange', listener);
      });
      const response = await fetch('/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language, sdp: peer.localDescription!.sdp }), signal: r.abort!.signal });
      if (!response.ok) throw new Error((await response.json()).error || 'voice_failed');
      const reader = response.body!.getReader();
      const decoder = new TextDecoder(); let pending = '';
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        pending += decoder.decode(chunk.value, { stream: true });
        let newline;
        while ((newline = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === 'setup') {
            r.connectedTimer = setTimeout(() => { setError('voice_failed'); cleanup(); setStatus('idle'); }, 20_000);
            await peer.setRemoteDescription({ type: 'answer', sdp: event.sdp });
          }
          if (event.type === 'state_changed') onChangeRef.current();
          if (event.type === 'error') setError(event.error);
          if (event.type === 'closed') { completed = true; if (!event.complete) setError('incomplete_close'); }
        }
      }
      if (!completed) setError('incomplete_close');
    } catch (e) {
      if (resources.current === r && !(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : 'voice_failed');
    } finally {
      clearTimeout(r.closingTimer);
      if (resources.current === r) { cleanup(); setStatus('idle'); onChangeRef.current(); }
    }
  }
  return { status, transcript, error, remaining, muted, toggleMute, start, stop };
}
