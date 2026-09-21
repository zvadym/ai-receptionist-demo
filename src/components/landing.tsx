import { ArrowRight, ArrowUpRight, AudioLines, CalendarDays, Check, CheckCheck, ChevronDown, Clock3, Globe2, Headphones, Heart, Leaf, MessageCircle, Mic, Phone, ShieldCheck, SlidersHorizontal, Stethoscope, UserRound, Volume2 } from 'lucide-react';
import type { Language } from '@/lib/clinic';
import { landingCopy } from '@/lib/landing-copy';
import { integrationBrands, telephonyBrands } from '@/lib/integration-brands';
import { DeveloperContact } from './developer-contact';
import { RequestAccessForm } from './request-access-form';
import { DocumentLanguage } from './document-language';
import '@/app/landing.css';

export function LandingLogo({ language }: { language: Language }) {
  return <a className="lp-logo" href={`/?l=${language}`} aria-label="Linden AI"><span className="lp-logo-symbol"><Leaf size={24} strokeWidth={1.8}/></span>linden<span className="lp-ai">/ AI</span></a>;
}
export function Landing({ language, signedIn }: { language: Language; signedIn: boolean }) {
  const t = landingCopy[language];
  const featureIcons = [MessageCircle, Stethoscope, CalendarDays, Clock3, Globe2, SlidersHorizontal];
  const channelIcons = [Globe2, Phone, MessageCircle];
  return <div className="lp" lang={language}>
    <DocumentLanguage language={language}/>
    <header className="lp-header lp-container"><LandingLogo language={language}/><nav aria-label={t.nav[0]}>{t.nav.map((label, i) => <a href={['#how', '#features', '#integrations'][i]} key={label}>{label}</a>)}</nav><div className="lp-header-right"><div className="lp-languages" aria-label="Language">{(['en','de','uk'] as const).map(l => <a key={l} href={`/?l=${l}`} hrefLang={l} lang={l} aria-current={l === language ? 'true' : undefined}>{l === 'uk' ? 'UA' : l.toUpperCase()}</a>)}</div><a className="lp-button lp-header-cta" href={signedIn ? `/demo?l=${language}` : '#access'}>{signedIn ? t.openDemo : t.access}<ArrowUpRight size={16}/></a></div></header>
    <main>
      <section className="lp-hero lp-container">
        <div className="lp-hero-copy"><p className="lp-badge"><span/>{t.badge}</p><h1>{t.headline[0]}<br/><em>{t.headline[1]}</em></h1><p className="lp-intro">{t.intro}</p><div className="lp-hero-actions"><a className="lp-button" href="#access">{t.access}<ArrowUpRight size={19}/></a><a className="lp-secondary" href="#how">{t.secondary}<ArrowRight size={17}/></a></div><p className="lp-hero-note"><ShieldCheck size={15}/>{t.heroNote}</p></div>
        <div className="lp-scene" aria-label={t.illustration}>
          <div className="lp-scene-grid" aria-hidden="true"/><span className="lp-flower lp-flower-one" aria-hidden="true">✳</span><span className="lp-flower lp-flower-two" aria-hidden="true">✳</span>
          <div className="lp-voice-window"><div className="lp-window-top"><span className="lp-window-dots" aria-hidden="true"><i/><i/><i/></span><span>LINDEN DENTAL</span><Volume2 size={16}/></div><div className="lp-orb"><div className="lp-orb-inner"><AudioLines size={52} strokeWidth={1.4}/></div><span className="lp-orb-spark"><Heart size={16} fill="currentColor"/></span></div><strong>{t.live}</strong><div className="lp-soundwave" aria-hidden="true">{[10,18,30,16,42,58,32,48,62,36,22,48,30,18,8].map((h,i) => <i key={i} style={{ height: h, animationDelay: `${i * -0.17}s` }}/>)}</div><div className="lp-call-controls" aria-hidden="true"><span><Mic size={17}/></span><span><Phone size={18}/></span><span><MessageCircle size={17}/></span></div></div>
          <div className="lp-chat lp-chat-person"><span className="lp-chat-avatar"><UserRound size={18}/></span><p>{t.caller}</p></div><div className="lp-chat lp-chat-agent"><span className="lp-chat-avatar"><Leaf size={18}/></span><p>{t.reply}</p></div>
          <div className="lp-appointment"><span className="lp-calendar-icon"><CalendarDays size={24}/></span><div><strong>{t.appointment}</strong><small>{t.appointmentSub}</small></div><CheckCheck size={20}/></div>
          <span className="lp-illustration-note">{t.illustration}</span>
        </div>
      </section>
      <div className="lp-benefits lp-container">{t.benefits.map((benefit,i) => { const Icon = [UserRound, Phone, CalendarDays][i]; return <article key={benefit.title}><Icon size={22} strokeWidth={1.7}/><h2>{benefit.title}</h2><p>{benefit.text}</p></article>; })}</div>
      <section className="lp-section lp-container" id="how"><div className="lp-section-heading"><div><p className="lp-eyebrow">{t.howLabel}</p><h2>{t.howTitle}</h2></div><p>{t.howText}</p></div><div className="lp-steps">{t.steps.map((step,i) => <article key={step.title}><div className="lp-step-top"><span>0{i+1}</span>{i<t.steps.length-1 ? <ArrowRight size={23}/> : <CheckCheck size={23}/>}</div><h3>{step.title}</h3><p>{step.text}</p></article>)}</div><div className="lp-call-cta"><div><h3>{t.callTitle}</h3><p>{t.callText}</p></div><div className="lp-call-action"><DeveloperContact language={language} label={t.callCta} linkedinUrl={process.env.LINKEDIN_PROFILE_URL}/><a className="lp-button lp-demo-cta" href="#access">{t.getDemo}<ArrowUpRight size={19}/></a></div></div>
      <div id="integrations">
        <div className="lp-crm lp-telephony" id="telephony"><p className="lp-eyebrow">{t.phoneLabel}</p><h3>{t.phoneTitle}</h3><p>{t.phoneText}</p><div className="lp-vendors">{telephonyBrands.map(brand => <a href={brand.href} key={brand.id} target="_blank" rel="noreferrer" className={`lp-vendor lp-vendor-${brand.id}`} aria-label={brand.name}><img src={`/integrations/${brand.asset}`} alt={brand.name} loading="lazy" width="130" height="52"/></a>)}</div><small>{t.phoneNote}</small></div>
        <div className="lp-crm"><p className="lp-eyebrow">{t.crmLabel}</p><h3>{t.crmTitle}</h3><p>{t.crmText}</p><div className="lp-vendors">{integrationBrands(language).map(brand => <a href={brand.href} key={brand.id} target="_blank" rel="noreferrer" className={`lp-vendor lp-vendor-${brand.id}`} aria-label={brand.name}><img src={`/integrations/${brand.asset}`} alt={brand.name} loading="lazy" width="130" height="52"/>{['helsi','cgm'].includes(brand.id) && <span>{brand.name}</span>}</a>)}</div><small>{t.crmNote}</small></div>
      </div></section>
      <section className="lp-feature-section" id="features"><div className="lp-container"><div className="lp-feature-heading"><p className="lp-eyebrow">{t.featuresLabel}</p><h2>{t.featuresTitle}</h2><span aria-hidden="true">✳</span></div><div className="lp-features">{t.features.map((feature,i) => { const Icon = featureIcons[i]; return <article key={feature.title}><span className="lp-feature-icon"><Icon size={23} strokeWidth={1.6}/></span><h3>{feature.title}</h3><p>{feature.text}</p></article>; })}</div></div></section>
      <section className="lp-section lp-container" id="channels"><div className="lp-section-heading"><div><p className="lp-eyebrow">{t.channelsLabel}</p><h2>{t.channelsTitle}</h2></div><p>{t.channelsText}</p></div><div className="lp-channels">{t.channels.map((channel,i) => { const Icon = channelIcons[i]; return <article key={channel.title} className={i===0 ? 'lp-channel-live' : ''}><span className="lp-channel-icon"><Icon size={29} strokeWidth={1.5}/></span><h3>{channel.title}</h3><p>{channel.text}</p><span className="lp-channel-status"><i/>{channel.status}</span></article>; })}</div>

      </section>
      <section className="lp-access-wrap" id="access"><div className="lp-access lp-container"><div className="lp-access-copy"><p className="lp-eyebrow">{t.formLabel}</p><h2>{t.formTitle}</h2><p>{t.formText}</p><ul>{t.formPoints.map(point => <li key={point}><span><Check size={16}/></span>{point}</li>)}</ul><div className="lp-access-decoration" aria-hidden="true"><Headphones size={30}/><span>hello.<br/>hallo.<br/><em>вітаю.</em></span><span className="lp-access-star">✳</span></div></div><RequestAccessForm language={language}/></div></section>
      <section className="lp-faq lp-section lp-container"><div><p className="lp-eyebrow">{t.faqLabel}</p><h2>{t.faqTitle}</h2></div><div className="lp-faq-list">{t.faqs.map(faq => <details key={faq.q}><summary>{faq.q}<ChevronDown size={20}/></summary><p>{faq.a}</p></details>)}</div></section>
    </main><footer className="lp-footer lp-container"><div><LandingLogo language={language}/><p>{t.footer}</p></div><div><span>© 2026 Linden AI</span><small>{t.demoDisclaimer}</small></div></footer>
  </div>;
}
