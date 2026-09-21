'use client';
import { useEffect, useState, useRef } from 'react';
import { ArrowRight, Leaf, ShieldCheck } from 'lucide-react';
import type { Language } from '@/lib/clinic';
import { landingCopy } from '@/lib/landing-copy';
import { DocumentLanguage } from './document-language';
import '@/app/landing.css';

export function AccessLink({ language }: { language: Language }) {
  const t = landingCopy[language];
  const loaded = useRef(false);
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    setToken(value); setReady(true);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  async function open() {
    setBusy(true); setError(false);
    try {
      const response = await fetch('/api/access/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const result = await response.json();
      if (!response.ok) throw new Error();
      window.location.assign(result.redirect);
    } catch { setError(true); setBusy(false); }
  }
  return <main className="lp lp-access-page" lang={language}><DocumentLanguage language={language}/><a className="lp-logo" href={`/?l=${language}`}><span className="lp-logo-symbol"><Leaf size={24}/></span>linden<span className="lp-ai">/ AI</span></a><section className="lp-link-card"><span className="lp-success-icon"><ShieldCheck size={28}/></span><h1>{t.accessPageTitle}</h1><p>{t.accessPageText}</p>{error || (ready && !token) ? <><p className="lp-form-error" role="alert">{t.invalidLink}</p><a className="lp-button" href={`/?l=${language}#access`}>{t.requestNew}<ArrowRight size={18}/></a></> : <button className="lp-button" disabled={!ready || busy} onClick={() => void open()}>{busy ? t.accessLoading : t.accessButton}<ArrowRight size={18}/></button>}<small>{t.demoDisclaimer}</small></section></main>;
}
