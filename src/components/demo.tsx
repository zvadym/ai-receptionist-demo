'use client';
import { useState, useEffect, useCallback } from 'react';
import { ArrowRight, Check, ChevronRight, Clock3, Leaf, Mic, MicOff, PhoneOff, CalendarDays, MapPin, LogOut, ShieldCheck, X, Headphones, Sparkles } from 'lucide-react';
import { services, doctors, doctorForService, languages, type Language } from '@/lib/clinic';
import { copy, errorText } from '@/lib/copy';
import type { Booking, Proposal, Slot } from '@/lib/booking';
import type { User } from '@/lib/auth';
import { useVoice } from './use-voice';
import { voiceIds, defaultVoice, type Voice } from '@/lib/voices';
import { CalendarOverview } from './calendar-overview';

type State = { user: User | null; bookings: Booking[]; proposal: Proposal | null; dates: string[]; voiceConfigured: boolean; localMail: boolean; pendingCalendarChanges: number };
const locales = { uk: 'uk-UA', de: 'de-AT', en: 'en-GB' };
export async function api(path: string, data?: unknown) {
  const response = await fetch(path, data === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'internal_error');
  return value;
}
export function Brand() {
  return <a className="brand" href="/" aria-label="Linden Dental"><span className="brand-mark"><Leaf size={25} strokeWidth={1.5}/></span><span>linden<span className="brand-sub">DENTAL</span></span></a>;
}
export function LanguageSwitch({ language, onChange, disabled = false }: { language: Language; onChange: (value: Language) => void; disabled?: boolean }) {
  return <div className="language-switch" role="group" aria-label={copy[language].language}>{(['uk','de','en'] as Language[]).map(l => <button key={l} title={languages[l]} aria-pressed={l === language} disabled={disabled} onClick={() => onChange(l)}>{l === 'uk' ? 'UA' : l.toUpperCase()}</button>)}</div>;
}
function Wave({ active = false }: { active?: boolean }) {
  return <div aria-hidden="true" className={`wave ${active ? 'wave-active' : ''}`}>{[12,22,36,25,46,64,38,76,52,32,62,82,50,30,60,42,22,36,16].map((height, i) => <i key={i} style={{ height, animationDelay: `${i * -0.13}s` }}/>)}</div>;
}

export function Demo({ initialLanguage = 'en' }: { initialLanguage?: Language }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  function changeLanguage(next: Language) {
    setLanguage(next);
    const url = new URL(window.location.href); url.searchParams.set('l', next);
    window.history.replaceState(null, '', url);
  }
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(false);
  const [serviceId, setServiceId] = useState('checkup');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [moving, setMoving] = useState<Booking | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<Voice>(defaultVoice);
  const [patient, setPatient] = useState<{patient_name?: string; patient_email?: string; patient_phone?: string; summary?: string}>({});
  const [manualProposalId, setManualProposalId] = useState<string | null>(null);
  const t = copy[language];
  const refresh = useCallback(async () => {
    try { const next = await api('/api/state'); setState(next); setDate(current => current || next.dates[0] || ''); }
    catch (e) { setError((e as Error).message); }
  }, []);
  const selectedDoctor = doctors.find(d => d.id === moving?.doctor_id) || doctorForService(serviceId);
  const voice = useVoice(() => { void refresh(); });
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!state?.pendingCalendarChanges) return; const timer = setInterval(() => void refresh(), 15000); return () => clearInterval(timer); }, [state?.pendingCalendarChanges, refresh]);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  useEffect(() => {
    if (!state?.user || !date) return;
    const abort = new AbortController();
    setSlotsLoading(true); setSlots([]);
    fetch(`/api/slots?service=${serviceId}&date=${date}&doctor=${selectedDoctor.id}`, { signal: abort.signal }).then(async r => { const value = await r.json(); if (!r.ok) throw new Error(value.error); return value; })
      .then(value => setSlots(value.slots)).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!abort.signal.aborted) setSlotsLoading(false); });
    return () => abort.abort();
  }, [state, serviceId, date, selectedDoctor.id]);


  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice(false);
    try { await work(); } catch (e) { setError((e as Error).message); await refresh(); } finally { setBusy(false); }
  }
  async function change(input: unknown) {
    await action(async () => { const result = await api('/api/bookings', input); setManualProposalId(result.proposal?.id ?? null); await refresh(); });
  }
  const formatTime = (iso: string) => new Intl.DateTimeFormat(locales[language], { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' }).format(new Date(iso));
  const formatDate = (iso: string) => new Intl.DateTimeFormat(locales[language], { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'Europe/Vienna' }).format(new Date(iso));
  const service = services.find(s => s.id === serviceId)!;

  return <div className="site-shell">
    <header className="site-header"><Brand/><div className="header-actions"><span className="demo-pill"><span/>{t.demo}</span><LanguageSwitch language={language} onChange={changeLanguage} disabled={voice.status !== 'idle'}/>{state?.user && <button className="icon-button logout" title={t.logout} aria-label={t.logout} disabled={busy || voice.status !== 'idle'} onClick={() => void action(async () => { await api('/api/access/logout', {}); window.location.assign(`/?l=${language}`); })}><LogOut size={18}/></button>}</div></header>
    <main>
      {error && <div className="alert error" role="alert">{errorText(error, language)}<button className="icon-button" onClick={() => setError('')} aria-label={t.close}><X size={16}/></button></div>}
      {!state ? <div className="loading">{t.loading}</div> : !state.user ? <div className="loading"><a href={`/?l=${language}#access`}>{t.access}</a></div> : <div className="dashboard">{state.pendingCalendarChanges > 0 && <p className="alert" role="status">{errorText('calendar_sync_pending', language)}</p>}
        <section className="dashboard-heading"><div><p className="eyebrow">{t.hello}, {state.user.name.split(' ')[0]} <span className="small-leaf">✳</span></p><h1>{t.dashboardTitle}</h1><p>{t.dashboardText}</p></div><div className="clinic-detail"><span><MapPin size={15}/>{t.location}</span><span><Clock3 size={15}/>{t.hours}</span></div></section>
        <div className="dashboard-grid"><div className="main-column">
          <section className="voice-card"><div className="section-top"><span className="eyebrow">{t.voiceLabel}</span><span className="voice-status"><span className={voice.status === 'active' ? 'live-dot' : 'quiet-dot'}/>{voice.status === 'active' ? t.listening : voice.status === 'connecting' ? t.connecting : voice.status === 'closing' ? t.closing : t.ready}</span></div>
            <div className="voice-center"><div className={`voice-emblem ${voice.status === 'active' ? 'speaking' : ''}`}><Headphones size={33} strokeWidth={1.3}/></div><h2>{t.voiceTitle}</h2><p>{t.voiceText}</p><Wave active={voice.status === 'active'}/>
              <div className="voice-picker"><label htmlFor="assistant-voice">{t.voice}</label><select id="assistant-voice" aria-describedby="voice-hint" value={selectedVoice} disabled={voice.status !== 'idle'} onChange={e => setSelectedVoice(e.target.value as Voice)}>{voiceIds.map(id => <option key={id} value={id}>{id[0].toUpperCase() + id.slice(1)}</option>)}</select><p id="voice-hint">{t.voiceHint}</p></div>
              {voice.status === 'idle' ? <button className="primary-button" disabled={!state.voiceConfigured} onClick={() => void voice.start(language, selectedVoice)}><Mic size={18}/>{t.start}<ArrowRight size={17}/></button> : <div className="voice-buttons"><button className="stop-button" disabled={voice.status === 'closing'} onClick={voice.stop}><PhoneOff size={17}/>{voice.status === 'closing' ? t.closing : t.stop}</button><button className="icon-button" disabled={voice.status !== 'active'} onClick={voice.toggleMute} aria-label={voice.muted ? t.muted : t.mute}>{voice.muted ? <MicOff size={19}/> : <Mic size={19}/>}</button><span className="timer">{Math.floor(voice.remaining/60)}:{String(voice.remaining%60).padStart(2,'0')}</span></div>}
              <small>{t.microphone}</small>
            </div>
            {!state.voiceConfigured && <div className="setup-note"><span className="notice-dot"/>{t.missingVoice}</div>}
            {voice.error && <div className="alert error" role="alert">{errorText(voice.error, language)}</div>}
            <details className="transcript" open={voice.transcript.length > 0}><summary>{t.transcripts}<span>{voice.transcript.length ? `${voice.transcript.length}` : '—'}</span></summary><div className="transcript-body" role="log">{voice.transcript.length ? voice.transcript.map((line, i) => <p key={i}><b>{line.speaker === 'user' ? t.you : t.assistant}</b>{line.text}</p>) : <p className="muted">{t.transcriptEmpty}</p>}</div></details>
          </section>
          {state?.proposal && state.proposal.id === manualProposalId && voice.status === 'idle' && <section className="confirm-panel" aria-label={t.preview}>
      <><span className="modal-icon"><CalendarDays size={25}/></span><p className="eyebrow">{state.proposal.change.action === 'create' ? t.booking : state.proposal.change.action === 'cancel' ? t.cancelling : t.moving}</p><h2>{t.preview}</h2><p className="muted">{t.previewText}</p><div className="confirmation-details"><strong>{services.find(s => s.id === state.proposal!.service_id)?.name[language]}</strong><span>{doctors.find(d => d.id === state.proposal!.doctor_id)?.name}</span><span>{formatDate(state.proposal.start)}</span><span>{formatTime(state.proposal.start)} – {formatTime(state.proposal.end)} · Europe/Vienna</span>{state.proposal.patient && <><span>{state.proposal.patient.name} · {state.proposal.patient.email}</span>{state.proposal.patient.phone && <span>{state.proposal.patient.phone}</span>}<span>{state.proposal.patient.summary}</span></>}</div>{error && <div className="alert error" role="alert">{errorText(error, language)}</div>}<button className="primary-button" disabled={busy} onClick={() => void action(async () => { await api('/api/bookings', { action: 'confirm', proposal_id: state.proposal!.id }); setMoving(null); setNotice(true); await refresh(); })}><Check size={17}/>{busy ? t.working : t.confirm}</button><button className="text-button" disabled={busy} onClick={() => void change({ action: 'dismiss', proposal_id: state.proposal!.id })}>{t.dismiss}</button></>
          </section>}
          <section className="calendar-card" id="calendar"><div className="section-top"><div><p className="eyebrow">{t.available}</p><h2>{t.calendar}</h2></div><CalendarDays size={22} strokeWidth={1.4}/></div><p className="muted small">{selectedDoctor.name} · {t.calendarNote}</p>
            {moving && <div className="move-notice">{t.selectingMove}<button className="text-button" onClick={() => setMoving(null)}>{t.cancelMove}</button></div>}
            <div className="calendar-fields"><label>{t.services}<select value={serviceId} disabled={!!moving || busy} onChange={e => setServiceId(e.target.value)}>{services.map(s => <option value={s.id} key={s.id}>{s.name[language]} · {s.minutes} {t.minutes}</option>)}</select></label><label>{t.date}<select value={date} disabled={busy} onChange={e => setDate(e.target.value)}>{state.dates.map(d => <option value={d} key={d}>{formatDate(d+'T12:00:00Z')}</option>)}</select></label></div>
            {!moving && <details className="patient-details"><summary>{t.patientDetails}</summary><div className="calendar-fields">
              <label>{t.patientName}<input value={patient.patient_name ?? state.user.name} maxLength={80} onChange={e => setPatient(p => ({...p, patient_name: e.target.value}))}/></label>
              <label>{t.patientEmail}<input type="email" value={patient.patient_email ?? state.user.email} maxLength={254} onChange={e => setPatient(p => ({...p, patient_email: e.target.value}))}/></label>
              <label>{t.patientPhone}<input type="tel" value={patient.patient_phone ?? ''} maxLength={40} onChange={e => setPatient(p => ({...p, patient_phone: e.target.value}))}/></label>
              <label>{t.visitSummary}<input value={patient.summary ?? ''} maxLength={600} onChange={e => setPatient(p => ({...p, summary: e.target.value}))}/></label>
            </div></details>}
            <div className="slot-grid" aria-label={t.chooseTime} aria-busy={slotsLoading}>{slotsLoading ? <p className="muted">{t.working}</p> : slots.length ? slots.map(slot => <button className="slot" disabled={busy} key={slot.start} onClick={() => void change(moving ? { action: 'reschedule', booking_id: moving.id, start: slot.start } : { action: 'create', doctor_id: selectedDoctor.id, service_id: service.id, start: slot.start, ...patient })}>{formatTime(slot.start)}</button>) : <p className="muted">{t.noSlots}</p>}</div>
          </section>
        </div><aside className="side-column"><section className="treatments"><p className="eyebrow">{t.services}</p>{services.map((s,i) => <button className={`treatment ${serviceId === s.id ? 'selected' : ''}`} disabled={!!moving} key={s.id} onClick={() => setServiceId(s.id)}><span className="treatment-index">0{i+1}</span><span><strong>{s.name[language]}</strong><span className="treatment-description">{s.description[language]}</span><span className="treatment-description">{doctorForService(s.id).name}</span><span className="treatment-meta">{s.minutes} {t.minutes}<i/> {s.id === 'filling' ? t.from + ' ' : ''}€{s.price}</span></span><ChevronRight size={16}/></button>)}</section>
          <section className="appointments"><div className="section-top"><h2>{t.myBookings}</h2><span className="count">{state.bookings.filter(b => b.status === 'confirmed').length}</span></div>{notice && <p className="success" role="status"><Check size={16}/>{t.success}</p>}{state.bookings.length ? state.bookings.map(b => <article className={`appointment ${b.status === 'cancelled' ? 'is-cancelled' : ''}`} key={b.id}><div className="booking-meta"><span className="booking-status">{b.status === 'confirmed' ? <Check size={12}/> : <X size={12}/>} {b.status === 'confirmed' ? t.confirmed : t.cancelled}</span><span>#{b.id.slice(0,6).toUpperCase()}</span></div><h3>{services.find(s => s.id === b.service_id)?.name[language]}</h3><p>{doctors.find(d => d.id === b.doctor_id)?.name}</p><p>{formatDate(b.start)} · {formatTime(b.start)}</p>{b.status === 'confirmed' && Date.parse(b.start)>Date.now() && <div className="booking-actions"><button disabled={busy} onClick={() => { setMoving(b); setServiceId(b.service_id); document.getElementById('calendar')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>{t.reschedule}</button><button disabled={busy} onClick={() => void change({ action: 'cancel', booking_id: b.id })}>{t.cancel}</button></div>}</article>) : <div className="empty-bookings"><CalendarDays size={33} strokeWidth={1}/><h3>{t.noBookings}</h3><p>{t.noBookingsSub}</p></div>}</section>
          <div className="care-note"><Sparkles size={20} strokeWidth={1.3}/><p>{t.footer}</p><span>LINDEN DENTAL</span></div>
        </aside></div>
        <CalendarOverview language={language} bookingRevision={state.bookings.map(b => `${b.id}:${b.start}:${b.status}`).join('|')}/>
      </div>}
    </main>
    <footer><span>© 2026 Linden Dental</span><span><ShieldCheck size={14}/>{t.demoNote}</span>{state?.localMail && <a href={`/dev/mail?lang=${language}`} target="_blank" rel="noreferrer">{t.localMail}<ArrowRight size={13}/></a>}</footer>

  </div>;
}

