'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Check, Eye, RefreshCw, CalendarDays } from 'lucide-react';
import { DateTime } from 'luxon';
import { doctors, timezone, type Language } from '@/lib/clinic';
import { calendarCopy } from '@/lib/calendar-copy';
import type { CalendarOverviewData, CalendarSegment, CalendarView } from '@/lib/calendar-overview';

const locales = { uk: 'uk-UA', de: 'de-AT', en: 'en-GB' };
const doctorColors: Record<string, { color: string; tint: string; initials: string }> = {
  'anna-weber': { color: '#367562', tint: '#eaf3ed', initials: 'AW' },
  'max-hoffmann': { color: '#4c7590', tint: '#eaf1f6', initials: 'MH' },
  'lara-fischer': { color: '#a16c40', tint: '#f7eee3', initials: 'LF' },
};
const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(Math.floor(minute % 60)).padStart(2, '0')}`;

export function CalendarOverview({ language, bookingRevision }: { language: Language; bookingRevision: string }) {
  const t = calendarCopy[language];
  const [date, setDate] = useState(() => DateTime.now().setZone(timezone).toISODate()!);
  const [view, setView] = useState<CalendarView>('week');
  const [selected, setSelected] = useState(() => doctors.map(d => d.id));
  const [data, setData] = useState<CalendarOverviewData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const day = DateTime.fromISO(date, { zone: timezone });
  const first = view === 'week' ? day.startOf('week') : day;
  const dates = Array.from({ length: view === 'week' ? 5 : 1 }, (_, i) => first.plus({ days: i }).toISODate()!);
  const activeDoctors = doctors.filter(d => selected.includes(d.id));
  const today = DateTime.now().setZone(timezone).toISODate();
  const labelDate = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locales[language], { ...options, timeZone: timezone }).format(DateTime.fromISO(value, { zone: timezone }).toJSDate());
  const periodTitle = view === 'day'
    ? labelDate(date, { day: 'numeric', month: 'long', year: 'numeric' })
    : `${labelDate(dates[0], { day: 'numeric', month: 'short' })} – ${labelDate(dates.at(-1)!, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError('');
    fetch(`/api/calendar?date=${date}&view=${view}`, { signal: abort.signal, cache: 'no-store' })
      .then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error); return value; })
      .then(value => { if (!abort.signal.aborted) setData(value); })
      .catch(e => { if (!abort.signal.aborted) { setError(e.message); setData(null); } })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [date, view, refresh, bookingRevision]);

  useEffect(() => {
    const update = () => { if (document.visibilityState === 'visible') setRefresh(n => n + 1); };
    const timer = setInterval(update, 30_000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, []);

  function move(direction: number) { setDate(day.plus({ days: direction * (view === 'week' ? 7 : 1) }).toISODate()!); }
  function segmentLabel(segment: CalendarSegment) {
    return `${t[segment.kind]} · ${clock(segment.start)}–${clock(segment.end)}${segment.source ? ` · ${segment.source === 'google' ? t.google : segment.source === 'local' ? t.local : t.both}` : ''}`;
  }
  const hasCurrentData = data?.dates.join() === dates.join();
  const start = data?.displayStart ?? 480, end = data?.displayEnd ?? 1080;
  const hours = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start + i * 60);

  return <section className="overview-card" aria-labelledby="calendar-overview-title">
    <div className="overview-heading"><div><p className="eyebrow">{t.eyebrow}</p><h2 id="calendar-overview-title">{t.title}</h2><p>{t.subtitle}</p></div><span className="overview-readonly"><Eye size={14}/>{t.readonly}</span></div>
    <div className="overview-filters" role="group" aria-label={t.doctors}>
      {doctors.map(doctor => <button key={doctor.id} className="calendar-toggle" aria-pressed={selected.includes(doctor.id)} style={{ '--doctor-color': doctorColors[doctor.id].color, '--doctor-tint': doctorColors[doctor.id].tint } as CSSProperties}
        onClick={() => setSelected(current => current.includes(doctor.id) ? current.filter(id => id !== doctor.id) : [...current, doctor.id])}>
        <span className="calendar-toggle-check">{selected.includes(doctor.id) && <Check size={12}/>}</span>{doctor.name}
      </button>)}
      {selected.length !== doctors.length && <button className="overview-all" onClick={() => setSelected(doctors.map(d => d.id))}>{t.all}</button>}
    </div>
    <div className="overview-toolbar"><div className="overview-navigation"><div className="overview-arrows"><button className="icon-button" aria-label={t.previous} onClick={() => move(-1)}><ChevronLeft size={18}/></button><button className="icon-button" aria-label={t.next} onClick={() => move(1)}><ChevronRight size={18}/></button></div><button className="overview-today" onClick={() => setDate(DateTime.now().setZone(timezone).toISODate()!)}>{t.today}</button><h3>{periodTitle}</h3></div>
      <div className="overview-controls"><input type="date" aria-label={t.date} value={date} min={DateTime.now().minus({ days: 365 }).toISODate()!} max={DateTime.now().plus({ days: 365 }).toISODate()!} onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setDate(e.target.value); }}/><div className="overview-view" role="group" aria-label={t.title}>{(['day','week'] as const).map(value => <button key={value} aria-pressed={view === value} onClick={() => setView(value)}>{t[value]}</button>)}</div><button className="icon-button" disabled={loading} aria-label={t.refresh} onClick={() => setRefresh(n => n + 1)}><RefreshCw size={16} className={loading ? 'overview-refreshing' : ''}/></button></div>
    </div>
    <div className="overview-meta"><span>{t.hours}</span><span>{timezone}</span></div>
    {error ? <div className="overview-empty" role="alert"><CalendarDays size={26}/><p>{error === 'calendar_not_configured' ? t.notConfigured : t.error}</p><button className="text-button" onClick={() => setRefresh(n => n + 1)}>{t.refresh}</button></div>
      : !activeDoctors.length ? <div className="overview-empty"><CalendarDays size={26}/><p>{t.empty}</p></div>
      : <div className="overview-scroll" tabIndex={0} role="region" aria-label={t.title} aria-busy={loading}>
        <div className={`overview-grid ${view === 'day' ? 'overview-day' : ''}`} style={{ '--days': dates.length, '--doctors': activeDoctors.length, minWidth: `${60 + dates.length * activeDoctors.length * (view === 'day' ? 95 : 66)}px` } as CSSProperties}>
          <div className="overview-gutter"><div className="overview-gutter-head"><ClockLabel/></div><div className="overview-time-axis">{hours.map(hour => <span key={hour} style={{ top: `${(hour - start) / (end - start) * 100}%` }}>{clock(hour)}</span>)}</div></div>
          {dates.map(date => <div className={`overview-date ${date === today ? 'is-today' : ''}`} key={date}>
            <div className="overview-date-title"><span>{labelDate(date, { weekday: 'short' })}</span><strong>{labelDate(date, { day: 'numeric' })}</strong></div>
            <div className="overview-doctor-lanes">{activeDoctors.map(doctor => {
              const calendar = hasCurrentData ? data.calendars.find(c => c.doctorId === doctor.id) : undefined;
              const segments = calendar?.days.find(d => d.date === date)?.segments ?? [];
              return <div className="overview-doctor" key={doctor.id} style={{ '--doctor-color': doctorColors[doctor.id].color, '--doctor-tint': doctorColors[doctor.id].tint } as CSSProperties}>
                <div className="overview-doctor-label" title={doctor.name}><span aria-hidden="true"/>{view === 'day' ? doctor.name.replace('Dr. ', '') : doctorColors[doctor.id].initials}</div>
                <div className="overview-lane" aria-label={`${doctor.name} · ${date}`}>
                  {!calendar ? <div className="overview-lane-loading" aria-label={t.loading}/>
                    : calendar.status !== 'ready' ? <div className="overview-lane-unavailable" title={t.unknown}><span>{t.unavailable}</span></div>
                    : segments.map(segment => <div key={segment.start} className={`calendar-segment segment-${segment.kind} ${segment.end - segment.start < 30 ? 'segment-short' : ''}`} role="img" aria-label={`${doctor.name} · ${segmentLabel(segment)}`} title={`${doctor.name}\n${segmentLabel(segment)}`} style={{ top: `${(segment.start - start) / (end - start) * 100}%`, height: `${(segment.end - segment.start) / (end - start) * 100}%` }}>
                      <span className="segment-label">{t[segment.kind]}</span>{segment.kind === 'busy' && <><span className="segment-time">{clock(segment.start)}–{clock(segment.end)}</span>{view === 'day' && <span className="segment-source">{segment.source === 'google' ? t.google : segment.source === 'local' ? t.local : t.both}</span>}</>}
                    </div>)}
                </div>
              </div>;
            })}</div>
          </div>)}
        </div>
      </div>}
    <div className="overview-footer"><div className="overview-legend"><span><i className="legend-free"/>{t.free}</span><span><i className="legend-busy"/>{t.busy}</span><span><i className="legend-break"/>{t.break}</span></div><span className="overview-updated" role="status">{loading ? t.loading : data && !error ? `${t.updated} ${new Intl.DateTimeFormat(locales[language], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: timezone }).format(new Date(data.updatedAt))}` : ''}</span></div>
    <p className="overview-hint">{t.hint}</p><p className="overview-source-note">{t.sourceNote}</p><p className="overview-scroll-hint">{t.scroll}</p>
  </section>;
}

function ClockLabel() { return <span aria-hidden="true">CET / CEST</span>; }
