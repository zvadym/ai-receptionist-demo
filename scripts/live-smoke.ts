// Opt-in paid integration test: node --env-file=.env.local --import tsx scripts/live-smoke.ts uk de en
// Uses macOS say/afconvert; all records and audio stay in an ignored .data folder.
import WebSocket from 'ws';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { voiceIds, defaultVoice, type Voice } from '../src/lib/voices';
import { voiceSessionConfig } from '../src/lib/live';
import { LiveToolRouter, type WireEvent } from '../src/lib/live-events';
import { greetingCommand } from '../src/lib/agent-prompts';
import { executeTool } from '../src/lib/tools';
import { db } from '../src/lib/db';
import { clinicDates, listBookings, pendingProposal } from '../src/lib/booking';
import { doctorForService, type Language } from '../src/lib/clinic';
import { DateTime } from 'luxon';

async function main() {
  assert(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY is required');
  const root = resolve('.data', `live-smoke-${Date.now()}`);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  process.env.APP_DATA_DIR = root;
  const proactive = process.argv.includes('--proactive');
  const outputVoice = process.argv.find(arg => arg.startsWith('--voice='))?.split('=')[1] || defaultVoice;
  assert(voiceIds.includes(outputVoice as Voice), 'Choose a supported --voice');
  const requestedService = process.argv.find(arg => arg.startsWith('--service='))?.split('=')[1];
  assert(!requestedService || (proactive && ['checkup', 'cleaning', 'filling'].includes(requestedService)), '--service=checkup|cleaning|filling requires --proactive');
  const selected = process.argv.slice(2).filter(arg => arg !== '--proactive' && !arg.startsWith('--service=') && !arg.startsWith('--voice='));
  const languages = selected.length ? selected : ['uk', 'de', 'en'];
  assert(languages.every(l => ['uk', 'de', 'en'].includes(l)), 'Use uk, de, or en');
  const user = { id: randomUUID(), name: 'Integration Test', email: 'integration@example.test' };
  db().prepare('INSERT INTO users(id,name,email) VALUES (?,?,?)').run(user.id, user.name, user.email);
  const report: unknown[] = [];
  try {
    for (const lang of languages) report.push(await run(lang as Language));
  } finally {
    writeFileSync(resolve(root, 'report.json'), JSON.stringify(report, null, 2));
    db().close();
    console.log('Artifacts:', root);
  }

  async function run(language: Language) {
    // Use a future bookable date so the scripted 09:00/10:00 appointments cannot be in the past.
    const bookingDate = clinicDates()[1];
    const noBooking = () => { assert.equal(listBookings(user.id).length, 0); assert(!pendingProposal(user.id), 'Do not prepare a booking before the visitor chooses a slot'); };
    const proactiveSpeech = {
      uk: ['Я хочу записатися на прийом.', 'У мене ниє зуб. Хочу, щоб лікар подивився.', 'Побажань немає, запропонуйте найближчий час.', `Потрібні інші варіанти. Мені зручно ${bookingDate} після п'ятнадцятої години.`, 'Дякую. Я поки подумаю, нічого не бронюйте.'],
      de: ['Ich möchte einen Termin vereinbaren.', 'Mein Zahn tut weh. Ich möchte ihn untersuchen lassen.', 'Ich habe keine Präferenzen. Bitte den frühesten Termin.', `Ich brauche andere Optionen am ${bookingDate} nach fünfzehn Uhr.`, 'Danke, ich möchte noch überlegen. Bitte nichts buchen.'],
      en: ['I would like to book an appointment.', 'My tooth aches. I would like a dentist to take a look.', 'I have no preferences. Please offer the earliest appointment.', `I need other options on ${bookingDate} after three in the afternoon.`, 'Thank you. I will think about it. Please do not book anything.'],
    }[language];
    if (requestedService) proactiveSpeech[1] = {
      checkup: { uk: 'Хочу огляд зубів.', de: 'Ich möchte eine zahnärztliche Kontrolle.', en: 'I would like a dental checkup.' },
      cleaning: { uk: 'Хочу професійну гігієну зубів.', de: 'Ich möchte eine professionelle Zahnreinigung.', en: 'I would like a professional dental cleaning.' },
      filling: { uk: 'Хочу записатися на лікування карієсу.', de: 'Ich möchte einen Termin für eine Kariesbehandlung.', en: 'I would like an appointment for a dental filling.' },
    }[requestedService as 'checkup'|'cleaning'|'filling'][language];
    const turns: { text: string; tools: string[]; state?: () => void }[] = proactive ? [
      { text: proactiveSpeech[0], tools: [], state: noBooking },
      { text: proactiveSpeech[1], tools: [], state: noBooking },
      { text: proactiveSpeech[2], tools: ['find_available_slots'], state: noBooking },
      { text: proactiveSpeech[3], tools: ['find_available_slots'], state: noBooking },
      { text: proactiveSpeech[4], tools: [], state: noBooking },
    ] : language === 'en' ? [
      { text: `Hello. Please check whether a dental checkup is available on ${bookingDate} at nine in the morning, and tell me the price.`, tools: ['get_doctors', 'find_available_slots'] },
      { text: 'Please prepare that checkup appointment at nine in the morning for me.', tools: ['prepare_booking'], state: () => assert.equal(listBookings(user.id).length, 0) },
      { text: 'Yes, I confirm this checkup appointment at nine in the morning.', tools: ['confirm_booking_change'], state: () => assert.equal(listBookings(user.id).filter(b => b.status === 'confirmed').length, 1) },
      { text: 'Please move my appointment to ten in the morning on the same day.', tools: ['prepare_reschedule'] },
      { text: 'Yes, I confirm moving it to ten in the morning.', tools: ['confirm_booking_change'], state: () => assert.equal(DateTime.fromISO(listBookings(user.id)[0].start).setZone('Europe/Vienna').hour, 10) },
      { text: 'Please cancel my appointment.', tools: ['prepare_cancellation'] },
      { text: 'Yes, I confirm cancelling my appointment.', tools: ['confirm_booking_change'], state: () => assert.equal(listBookings(user.id)[0].status, 'cancelled') },
    ] : [{ text: language === 'uk' ? 'Добрий день. Скільки коштує огляд зубів і скільки часу він триває?' : 'Guten Tag. Wie viel kostet eine zahnärztliche Kontrolle und wie lange dauert sie?', tools: ['get_clinic_info'] }];
    const voice = { uk: 'Lesya', de: 'Anna', en: 'Samantha' }[language];
    const clips = turns.map((turn, i) => {
      const source = resolve(root, `${language}-${i}.aiff`), wav = resolve(root, `${language}-${i}.wav`);
      execFileSync('say', ['-v', voice, '-r', '165', '-o', source, turn.text]);
      execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@24000', '-c', '1', source, wav]);
      const bytes = readFileSync(wav);
      for (let pos = 12; pos + 8 <= bytes.length;) {
        const size = bytes.readUInt32LE(pos + 4);
        if (bytes.toString('ascii', pos, pos + 4) === 'data') return bytes.subarray(pos + 8, pos + 8 + size);
        pos += 8 + size + (size % 2);
      }
      throw new Error('Synthesized WAV has no audio data');
    });
    const headers = { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` };
    const ws = new WebSocket('wss://api.openai.com/v1/live/sessions', { headers, handshakeTimeout: 10000 });
    let providerId = '', started = false, closed = false, closing = false;
    let failure: Error | undefined, usage: unknown;
    let clip = Buffer.alloc(0), offset = 0, lastOutput = 0, lastTool = 0, assistant = '', caller = '';
    const audio: Buffer[] = [], calls: { name: string; args: string; result: any }[] = [];
    const events: unknown[] = [];
    const send = (socket: WebSocket, event: object) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event)); };
    const close = () => { if (!closing) { closing = true; send(ws, { type: 'session.close' }); } };
    ws.on('error', error => { failure = error; });
    ws.on('message', raw => {
      const e = JSON.parse(raw.toString());
      if (!e.type.includes('audio')) events.push(e);
      if (e.type === 'session.started') { started = true; providerId = e.session.id; }
      if (e.type === 'session.closed') { closed = true; usage = e.usage; }
      // Live emits audio continuously, including silence; it has no audio-done event.
      if (e.type === 'session.output_audio.delta') audio.push(Buffer.from(e.delta, 'base64'));
      if (e.type === 'session.output_transcript.delta') { lastOutput = Date.now(); assistant += e.delta; }
      if (e.type === 'session.input_transcript.delta') caller += e.delta;
      if (e.type === 'error') failure = new Error(JSON.stringify(e.error));
    });
    const timeout = setTimeout(close, 210000);
    const feed = setInterval(() => {
      if (!started || closing) return;
      const frame = Buffer.alloc(4800);
      if (offset < clip.length) offset += clip.copy(frame, 0, offset, offset + frame.length);
      send(ws, { type: 'session.input_audio.append', audio: frame.toString('base64') });
    }, 100);
    async function until(predicate: () => boolean, timeoutMs = 45000, ignoreError = false) {
      const deadline = Date.now() + timeoutMs;
      while (!predicate()) {
        if (failure && !ignoreError) throw failure;
        if (Date.now() > deadline) throw new Error(`Timed out (${language}): ${JSON.stringify({ assistant, caller, calls: calls.map(c => c.name) })}`);
        await delay(200);
      }
    }
    try {
      await until(() => ws.readyState === WebSocket.OPEN, 10000);
      const config = voiceSessionConfig(user, language, outputVoice as Voice);
      send(ws, { type: 'session.start', session: { ...config, audio: { ...config.audio, format: { type: 'audio/pcm', rate: 24000 } } } });
      await until(() => started, 15000);
      // Primary WebSocket sessions execute tools on their primary connection.
      // Sideband attachment is for the application's WebRTC/SIP transport only.
      const router = new LiveToolRouter(e => send(ws, e), call => {
        const output = executeTool(user.id, providerId, call.call_id, call.name, call.arguments);
        const result = JSON.parse(output);
        if (result.ok && call.name === 'find_available_slots') {
          assert(calls.some(c => c.name === 'get_doctors' && c.result.ok), 'Retrieve the roster before searching for a doctor');
          if (requestedService) assert.equal(result.result.service.id, requestedService);
        }
        if (result.ok && ['find_available_slots', 'prepare_booking', 'prepare_reschedule', 'prepare_cancellation', 'confirm_booking_change'].includes(call.name)) {
          assert.equal(result.result.doctor.id, doctorForService(result.result.service.id).id, 'Use the configured calendar owner throughout the booking flow');
        }
        lastTool = Date.now();
        calls.push({ name: call.name, args: call.arguments, result: JSON.parse(output) });
        console.log(language, 'TOOL', call.name, JSON.parse(output).ok);
        return output;
      });
      ws.on('message', raw => {
        try { const event = JSON.parse(raw.toString()) as WireEvent; if (!closing) router.receive(event); }
        catch (error) { failure = error instanceof Error ? error : new Error(String(error)); close(); }
      });
      send(ws, greetingCommand(language));
      await until(() => assistant.length > 0 && Date.now() - lastOutput > 1800, 25000);
      console.log(language, 'GREETING', assistant);
      for (let i = 0; i < turns.length; i++) {
        const turn = turns[i], count = calls.length, before = assistant.length;
        console.log(language, 'USER', turn.text);
        clip = clips[i]; offset = 0;
        await until(() => offset >= clip.length);
        await until(() => turn.tools.every(name => calls.slice(count).some(c => c.name === name && c.result.ok)) && assistant.length > before && Date.now() - lastTool > 8000 && Date.now() - lastOutput > 3000);
        if (proactive && i < 2) assert(!calls.slice(count).some(c => c.name === 'find_available_slots'), 'Ask for preferences and wait before searching for appointments');
        if (proactive && i === 3) assert(calls.slice(count).some(c => c.name === 'find_available_slots' && JSON.parse(c.args).date === bookingDate && c.result.ok), 'Check the requested alternative date');
        turn.state?.();
        if (turn.tools.some(t => t.startsWith('prepare_'))) assert(pendingProposal(user.id), 'Proposal must remain unconfirmed until next user turn');
        console.log(language, 'ASSISTANT', assistant.slice(before));
      }
    } finally {
      close();
      try { await until(() => closed, 15000, true); } finally {
        clearInterval(feed); clearTimeout(timeout); ws.terminate();
        writeFileSync(resolve(root, `${language}-events.json`), JSON.stringify(events, null, 2));
        writeFileSync(resolve(root, `${language}-assistant.pcm`), Buffer.concat(audio));
        console.log(language, 'CLOSED', closed, JSON.stringify(usage));
      }
    }
    assert(closed, 'Final usage must be received');
    return { language, assistant, caller, calls, usage, closed };
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
