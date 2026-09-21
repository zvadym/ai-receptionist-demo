'use client';
import { useState } from 'react';
import { ArrowRight, Mail, Check, ShieldCheck } from 'lucide-react';
import type { Language } from '@/lib/clinic';
import { landingCopy } from '@/lib/landing-copy';

export function RequestAccessForm({ language }: { language: Language }) {
  const t = landingCopy[language];
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ email: string; local: boolean } | null>(null);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/access/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: data.get('name'), email: data.get('email'), clinic: data.get('clinic'), website: data.get('website'), language }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setSent({ email: String(data.get('email')), local: value.mailMode === 'local' });
    } catch (e) { const code = (e as Error).message; setError(code === 'mail_not_configured' ? t.configError : code === 'rate_limited' ? t.limitError : t.error); }
    finally { setBusy(false); }
  }
  return <div className="lp-form-card">
    {sent ? <div className="lp-form-success" role="status"><span className="lp-success-icon">{sent.local ? <Mail/> : <Check/>}</span><h3>{sent.local ? t.localTitle : t.successTitle}</h3><p>{sent.local ? t.localText : t.successText}</p><p className="lp-recipient">{sent.email}</p>{sent.local && <a className="lp-button" href={`/dev/mail?lang=${language}`} target="_blank" rel="noreferrer">{t.localOpen}<ArrowRight size={17}/></a>}<button type="button" className="lp-text-button" onClick={() => setSent(null)}>{t.resend}</button></div> : <>
      <span className="lp-form-icon"><Mail size={23}/></span><h3>{t.formHeading}</h3><p>{t.formSub}</p>
      <form onSubmit={submit}>
        <label htmlFor="lead-name">{t.name}<input id="lead-name" name="name" autoComplete="name" minLength={2} maxLength={80} required placeholder="Alex Morgan" disabled={busy}/></label>
        <label htmlFor="lead-email">{t.email}<input id="lead-email" name="email" type="email" autoComplete="email" maxLength={254} required placeholder="alex@example.test" disabled={busy}/></label>
        <label htmlFor="lead-clinic">{t.clinic} <span>({t.optional})</span><input id="lead-clinic" name="clinic" autoComplete="organization" maxLength={160} disabled={busy}/></label>
        <div className="lp-honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
        {error && <p className="lp-form-error" role="alert">{error}</p>}
        <button type="submit" className="lp-button" disabled={busy}>{busy ? t.submitting : t.submit}<ArrowRight size={18}/></button>
      </form><small className="lp-privacy"><ShieldCheck size={16}/>{t.privacy}</small>
    </>}
  </div>;
}
