'use client';
import { useRef, useState } from 'react';
import { ArrowUpRight, Linkedin, X } from 'lucide-react';
import type { Language } from '@/lib/clinic';
import { contactCopy } from '@/lib/contact-copy';

export function DeveloperContact({ language, label, linkedinUrl }: { language: Language; label: string; linkedinUrl?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState('');
  const t = contactCopy[language];
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: data.get('name'), email: data.get('email'), message: data.get('message'), website: data.get('website'), language }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setSent(value.mailMode);
    } catch (error) {
      const code = (error as Error).message;
      setError(code === 'contact_delivery_failed' ? t.failed : code === 'rate_limited' ? t.limit : t.error);
    } finally { setBusy(false); }
  }
  return <>
    <button className="lp-button" type="button" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>{label}<ArrowUpRight size={19}/></button>
    <dialog ref={dialog} className="lp-contact-dialog" aria-labelledby="contact-title" aria-describedby="contact-intro">
      <button type="button" className="lp-contact-close" aria-label={t.close} onClick={() => dialog.current?.close()}><X size={21}/></button>
      <div className="lp-form-card">
        <h3 id="contact-title">{t.title}</h3><p id="contact-intro">{t.intro}</p>
        {sent ? <div role="status" className="lp-contact-success"><strong>{sent === 'local' ? t.local : t.success}</strong>{sent !== 'local' && <p>{t.successText}</p>}</div> : <form onSubmit={submit}>
          <label htmlFor="contact-name">{t.name}<input id="contact-name" name="name" autoComplete="name" minLength={2} maxLength={80} required disabled={busy}/></label>
          <label htmlFor="contact-email">{t.email}<input id="contact-email" name="email" type="email" autoComplete="email" maxLength={254} required disabled={busy}/></label>
          <label htmlFor="contact-message">{t.message}<textarea id="contact-message" name="message" rows={4} minLength={10} maxLength={2000} required placeholder={t.placeholder} disabled={busy}/></label>
          <div className="lp-honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
          {error && <p role="alert" className="lp-form-error">{error}</p>}
          <button type="submit" className="lp-button" disabled={busy}>{busy ? t.sending : t.submit}<ArrowUpRight size={18}/></button>
          <small className="lp-privacy">{t.privacy}</small>
        </form>}
        {linkedinUrl && <div className="lp-contact-alternative"><span>{t.divider}</span><a className="lp-secondary" href={linkedinUrl} target="_blank" rel="noreferrer"><Linkedin size={19}/>{t.linkedin}<ArrowUpRight size={16}/></a></div>}
      </div>
    </dialog>
  </>;
}
