'use client';
import { useEffect, useState } from 'react';
import { Brand, LanguageSwitch, api } from '@/components/demo';
import { copy } from '@/lib/copy';
import type { Language } from '@/lib/clinic';
type Message = { id: string; recipient: string; subject: string; body: string; created: number };
export default function Mailbox() {
  const [language, setLanguage] = useState<Language>('uk');
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState(false);
  const t = copy[language];
  async function refresh() { try { setMessages((await api('/api/dev/mail')).messages); } catch { setError(true); } }
  useEffect(() => { const lang = new URLSearchParams(window.location.search).get('lang'); if (lang === 'uk' || lang === 'de' || lang === 'en') setLanguage(lang); void refresh(); }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  return <div className="site-shell"><header className="site-header"><Brand/><LanguageSwitch language={language} onChange={setLanguage}/></header><main className="mailbox"><p className="eyebrow">DEVELOPMENT</p><h1>{t.mailboxTitle}</h1><p className="muted">{t.mailboxText}</p><div className="mail-actions"><button className="primary-button" onClick={()=>void refresh()}>{t.refresh}</button><a href="/">{t.returnDemo}</a></div>{error ? <p role="alert">404 · Not available</p> : messages.length ? messages.map(m=><article className="mail-message" key={m.id}><div className="mail-meta"><span>{m.recipient}</span><time>{new Date(m.created).toLocaleTimeString()}</time></div><h2>{m.subject}</h2><pre>{m.body}</pre></article>) : <p>{t.emptyMail}</p>}</main></div>;
}
