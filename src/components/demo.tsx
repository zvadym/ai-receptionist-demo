'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowRight, Check, ChevronRight, Clock3, Leaf, Mail, Mic, MicOff, PhoneOff, CalendarDays, MapPin, LogOut, ShieldCheck, X, Headphones, Sparkles } from 'lucide-react';
import { services, doctors, doctorForService, languages, type Language } from '@/lib/clinic';
import { copy, errorText } from '@/lib/copy';
import type { Booking, Proposal, Slot } from '@/lib/booking';
import type { User } from '@/lib/auth';
import { useVoice } from './use-voice';

type State = { user: User | null; bookings: Booking[]; proposal: Proposal | null; dates: string[]; voiceConfigured: boolean; localMail: boolean };
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

export function Demo() {
  const [language, setLanguage] = useState<Language>('uk');
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(false);
  const [serviceId, setServiceId] = useState('checkup');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [moving, setMoving] = useState<Booking | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const t = copy[language];
  const refresh = useCallback(async () => {
    try { const next = await api('/api/state'); setState(next); setDate(current => current || next.dates[0] || ''); }
    catch (e) { setError((e as Error).message); }
  }, []);
  const selectedDoctor = doctors.find(d => d.id === moving?.doctor_id) || doctorForService(serviceId);
  const voice = useVoice(() => { void refresh(); });
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  useEffect(() => {
    if (!state?.user || !date) return;
    const abort = new AbortController();
    setSlotsLoading(true); setSlots([]);
    fetch(`/api/slots?service=${serviceId}&date=${date}&doctor=${selectedDoctor.id}`, { signal: abort.signal }).then(async r => { const value = await r.json(); if (!r.ok) throw new Error(value.error); return value; })
      .then(value => setSlots(value.slots)).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!abort.signal.aborted) setSlotsLoading(false); });
    return () => abort.abort();
  }, [state, serviceId, date, selectedDoctor.id]);
  useEffect(() => {
    if (state?.proposal && !dialog.current?.open) dialog.current?.showModal();
    if (!state?.proposal && dialog.current?.open) dialog.current.close();
  }, [state?.proposal]);

  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice(false);
    try { await work(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function change(input: unknown) {
    await action(async () => { await api('/api/bookings', input); await refresh(); });
  }
  const formatTime = (iso: string) => new Intl.DateTimeFormat(locales[language], { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' }).format(new Date(iso));
  const formatDate = (iso: string) => new Intl.DateTimeFormat(locales[language], { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'Europe/Vienna' }).format(new Date(iso));
  const service = services.find(s => s.id === serviceId)!;

  return <div className="site-shell">
    <header className="site-header"><Brand/><div className="header-actions"><span className="demo-pill"><span/>{t.demo}</span><LanguageSwitch language={language} onChange={setLanguage} disabled={voice.status !== 'idle'}/>{state?.user && <button className="icon-button logout" title={t.logout} aria-label={t.logout} disabled={busy || voice.status !== 'idle'} onClick={() => void action(async () => { await api('/api/access/logout', {}); await refresh(); })}><LogOut size={18}/></button>}</div></header>
    <main>
      {error && <div className="alert error" role="alert">{errorText(error, language)}<button className="icon-button" onClick={() => setError('')} aria-label={t.close}><X size={16}/></button></div>}
      {!state ? <div className="loading">{t.loading}</div> : !state.user ? <div className="welcome-layout">
        <section className="welcome-story"><p className="eyebrow"><span className="little-line"/>{t.concierge}</p><h1>{t.headline.split('\n').map((line, i) => <span key={line} className={i ? 'serif-italic' : ''}>{line}</span>)}</h1><p className="intro">{t.intro}</p>
          <div className="welcome-art" aria-hidden="true"><div className="art-caption"><span className="live-dot"/> LINDEN · VOICE CONCIERGE</div><Wave/><div className="art-bottom"><span>UA / DE / EN</span><span className="art-circle"><Mic size={20}/></span><span>01 — 03</span></div></div>
          <div className="steps">{[t.step1,t.step2,t.step3].map((text,i) => <div key={text}><span className="step-number">0{i+1}</span>{text}{i<2 && <ChevronRight size={14}/>}</div>)}</div>
        </section>
        <AccessForm language={language} localMail={state.localMail} onSuccess={refresh}/>
      </div> : <div className="dashboard">
        <section className="dashboard-heading"><div><p className="eyebrow">{t.hello}, {state.user.name.split(' ')[0]} <span className="small-leaf">✳</span></p><h1>{t.dashboardTitle}</h1><p>{t.dashboardText}</p></div><div className="clinic-detail"><span><MapPin size={15}/>{t.location}</span><span><Clock3 size={15}/>{t.hours}</span></div></section>
        <div className="dashboard-grid"><div className="main-column">
          <section className="voice-card"><div className="section-top"><span className="eyebrow">{t.voiceLabel}</span><span className="voice-status"><span className={voice.status === 'active' ? 'live-dot' : 'quiet-dot'}/>{voice.status === 'active' ? t.listening : voice.status === 'connecting' ? t.connecting : voice.status === 'closing' ? t.closing : t.ready}</span></div>
            <div className="voice-center"><div className={`voice-emblem ${voice.status === 'active' ? 'speaking' : ''}`}><Headphones size={33} strokeWidth={1.3}/></div><h2>{t.voiceTitle}</h2><p>{t.voiceText}</p><Wave active={voice.status === 'active'}/>
              {voice.status === 'idle' ? <button className="primary-button" disabled={!state.voiceConfigured} onClick={() => void voice.start(language)}><Mic size={18}/>{t.start}<ArrowRight size={17}/></button> : <div className="voice-buttons"><button className="stop-button" disabled={voice.status === 'closing'} onClick={voice.stop}><PhoneOff size={17}/>{voice.status === 'closing' ? t.closing : t.stop}</button><button className="icon-button" disabled={voice.status !== 'active'} onClick={voice.toggleMute} aria-label={voice.muted ? t.muted : t.mute}>{voice.muted ? <MicOff size={19}/> : <Mic size={19}/>}</button><span className="timer">{Math.floor(voice.remaining/60)}:{String(voice.remaining%60).padStart(2,'0')}</span></div>}
              <small>{t.microphone}</small>
            </div>
            {!state.voiceConfigured && <div className="setup-note"><span className="notice-dot"/>{t.missingVoice}</div>}
            {voice.error && <div className="alert error" role="alert">{errorText(voice.error, language)}</div>}
            <details className="transcript" open={voice.transcript.length > 0}><summary>{t.transcripts}<span>{voice.transcript.length ? `${voice.transcript.length}` : '—'}</span></summary><div className="transcript-body" role="log">{voice.transcript.length ? voice.transcript.map((line, i) => <p key={i}><b>{line.speaker === 'user' ? t.you : t.assistant}</b>{line.text}</p>) : <p className="muted">{t.transcriptEmpty}</p>}</div></details>
          </section>
          <section className="calendar-card" id="calendar"><div className="section-top"><div><p className="eyebrow">{t.available}</p><h2>{t.calendar}</h2></div><CalendarDays size={22} strokeWidth={1.4}/></div><p className="muted small">{selectedDoctor.name} · {t.calendarNote}</p>
            {moving && <div className="move-notice">{t.selectingMove}<button className="text-button" onClick={() => setMoving(null)}>{t.cancelMove}</button></div>}
            <div className="calendar-fields"><label>{t.services}<select value={serviceId} disabled={!!moving || busy} onChange={e => setServiceId(e.target.value)}>{services.map(s => <option value={s.id} key={s.id}>{s.name[language]} · {s.minutes} {t.minutes}</option>)}</select></label><label>{t.date}<select value={date} disabled={busy} onChange={e => setDate(e.target.value)}>{state.dates.map(d => <option value={d} key={d}>{formatDate(d+'T12:00:00Z')}</option>)}</select></label></div>
            <div className="slot-grid" aria-label={t.chooseTime} aria-busy={slotsLoading}>{slotsLoading ? <p className="muted">{t.working}</p> : slots.length ? slots.map(slot => <button className="slot" disabled={busy} key={slot.start} onClick={() => void change(moving ? { action: 'reschedule', booking_id: moving.id, start: slot.start } : { action: 'create', doctor_id: selectedDoctor.id, service_id: service.id, start: slot.start })}>{formatTime(slot.start)}</button>) : <p className="muted">{t.noSlots}</p>}</div>
          </section>
        </div><aside className="side-column"><section className="treatments"><p className="eyebrow">{t.services}</p>{services.map((s,i) => <button className={`treatment ${serviceId === s.id ? 'selected' : ''}`} disabled={!!moving} key={s.id} onClick={() => setServiceId(s.id)}><span className="treatment-index">0{i+1}</span><span><strong>{s.name[language]}</strong><span className="treatment-description">{s.description[language]}</span><span className="treatment-description">{doctorForService(s.id).name}</span><span className="treatment-meta">{s.minutes} {t.minutes}<i/> {s.id === 'filling' ? t.from + ' ' : ''}€{s.price}</span></span><ChevronRight size={16}/></button>)}</section>
          <section className="appointments"><div className="section-top"><h2>{t.myBookings}</h2><span className="count">{state.bookings.filter(b => b.status === 'confirmed').length}</span></div>{notice && <p className="success" role="status"><Check size={16}/>{t.success}</p>}{state.bookings.length ? state.bookings.map(b => <article className={`appointment ${b.status === 'cancelled' ? 'is-cancelled' : ''}`} key={b.id}><div className="booking-meta"><span className="booking-status">{b.status === 'confirmed' ? <Check size={12}/> : <X size={12}/>} {b.status === 'confirmed' ? t.confirmed : t.cancelled}</span><span>#{b.id.slice(0,6).toUpperCase()}</span></div><h3>{services.find(s => s.id === b.service_id)?.name[language]}</h3><p>{doctors.find(d => d.id === b.doctor_id)?.name}</p><p>{formatDate(b.start)} · {formatTime(b.start)}</p>{b.status === 'confirmed' && Date.parse(b.start)>Date.now() && <div className="booking-actions"><button disabled={busy} onClick={() => { setMoving(b); setServiceId(b.service_id); document.getElementById('calendar')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>{t.reschedule}</button><button disabled={busy} onClick={() => void change({ action: 'cancel', booking_id: b.id })}>{t.cancel}</button></div>}</article>) : <div className="empty-bookings"><CalendarDays size={33} strokeWidth={1}/><h3>{t.noBookings}</h3><p>{t.noBookingsSub}</p></div>}</section>
          <div className="care-note"><Sparkles size={20} strokeWidth={1.3}/><p>{t.footer}</p><span>LINDEN DENTAL</span></div>
        </aside></div>
      </div>}
    </main>
    <footer><span>© 2026 Linden Dental</span><span><ShieldCheck size={14}/>{t.demoNote}</span>{state?.localMail && <a href={`/dev/mail?lang=${language}`} target="_blank" rel="noreferrer">{t.localMail}<ArrowRight size={13}/></a>}</footer>
    <dialog ref={dialog} className="confirm-dialog" onCancel={e => { e.preventDefault(); if (!busy && state?.proposal) void change({ action: 'dismiss', proposal_id: state.proposal.id }); }}>
      {state?.proposal && <><span className="modal-icon"><CalendarDays size={25}/></span><p className="eyebrow">{state.proposal.change.action === 'create' ? t.booking : state.proposal.change.action === 'cancel' ? t.cancelling : t.moving}</p><h2>{t.preview}</h2><p className="muted">{t.previewText}</p><div className="confirmation-details"><strong>{services.find(s => s.id === state.proposal!.service_id)?.name[language]}</strong><span>{doctors.find(d => d.id === state.proposal!.doctor_id)?.name}</span><span>{formatDate(state.proposal.start)}</span><span>{formatTime(state.proposal.start)} – {formatTime(state.proposal.end)} · Europe/Vienna</span></div>{error && <div className="alert error" role="alert">{errorText(error, language)}</div>}<button className="primary-button" disabled={busy} onClick={() => void action(async () => { await api('/api/bookings', { action: 'confirm', proposal_id: state.proposal!.id }); setMoving(null); setNotice(true); await refresh(); })}><Check size={17}/>{busy ? t.working : t.confirm}</button><button className="text-button" disabled={busy} onClick={() => void change({ action: 'dismiss', proposal_id: state.proposal!.id })}>{t.dismiss}</button></>}
    </dialog>
  </div>;
}

function AccessForm({ language, localMail, onSuccess }: { language: Language; localMail: boolean; onSuccess: () => Promise<void> }) {
  const [step, setStep] = useState<'request'|'verify'>('request');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const t = copy[language];
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (step === 'request') { await api('/api/access/request', { name, email, language }); setStep('verify'); }
      else { await api('/api/access/verify', { email, code }); await onSuccess(); }
    } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="access-card"><div className="access-icon">{step === 'request' ? <Leaf size={27} strokeWidth={1.3}/> : <Mail size={26} strokeWidth={1.3}/>}</div><p className="eyebrow">LINDEN DENTAL</p><h2>{step === 'request' ? t.access : t.codeTitle}</h2><p className="access-description">{step === 'request' ? t.accessText : <>{t.codeText}<br/><strong>{email}</strong></>}</p>
    <form onSubmit={submit}>{step === 'request' ? <><label>{t.name}<input required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder={language === 'uk' ? 'Олександр' : 'Alex'}/></label><label>{t.email}<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label></> : <><label>{t.email}<input required type="email" value={email} autoComplete="email" onChange={e=>setEmail(e.target.value)}/></label><label>{t.code}<input className="code-input" autoFocus required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="000000"/></label><p className="field-hint">{t.expires}</p></>}
      {error && <p className="form-error" role="alert">{errorText(error,language)}</p>}<button className="primary-button" disabled={busy} type="submit">{busy ? t.working : step === 'request' ? t.send : t.verify}<ArrowRight size={17}/></button>
    </form><button className="text-button" disabled={busy} onClick={()=> { setStep(step === 'request' ? 'verify' : 'request'); setError(''); }}>{step === 'request' ? t.haveCode : t.back}</button>
    {step === 'verify' && localMail && <div className="local-mail-note"><p>{t.localMailHint}</p><a href={`/dev/mail?lang=${language}`} target="_blank" rel="noreferrer">{t.localMail}<ArrowRight size={14}/></a></div>}
    <div className="access-privacy"><ShieldCheck size={15}/><span>{t.privacy}</span></div>
  </section>;
}
