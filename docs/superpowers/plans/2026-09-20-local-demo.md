# Local booking assistant implementation plan

**Goal:** Run the approved multilingual booking demo locally, with automatic email codes and a real GPT-Live integration ready for credentials.

**Architecture:** Next.js serves the UI and authenticated route handlers. Local SQLite owns access, bookings and usage; the Live sideband is the only tool executor. A local mailbox enables end-to-end access testing without an email provider.

**Tech stack:** TypeScript, Next.js, React, better-sqlite3, Luxon, ws, Nodemailer, Zod.

## Constraints
- GPT-Live model is exactly gpt-live-1; never substitute Realtime.
- Languages: uk, de, en; calendar timezone Europe/Vienna.
- Local-only startup on loopback; no Vercel deployment in this phase.
- Missing credentials are visible, never silently simulated.
- Execute inline in this session; no separate tasks or agents needed.

## Work
- [x] Persistence and access: src/lib/db.ts, auth.ts, mail.ts, http.ts; request/verify/logout API. Test one-time codes and rate limits.
- [x] Calendar and tools: src/lib/clinic.ts, booking.ts, tools.ts. listSlots(serviceId, date) returns validated local availability; prepareChange(userId, action) returns a proposal; confirmChange(userId, proposalId) performs an atomic mutation and returns its persisted result. Test overlaps, foreign ownership, duplicate confirmations and DST.
- [x] Live transport: src/lib/live.ts plus voice route. HTTP setup -> sideband ready -> SDP returned on event stream -> browser WebRTC. Capture nested response events; submit every tool result before response.create; server closes at five minutes. Test event ordering with mock sockets without pretending to validate speech.
- [x] Interface: translations, access form, dashboard, voice hook, local mailbox. Verify Ukrainian/German/English, mobile layout, access flow, manual create/reschedule/cancel and missing-key state.
- [x] Finish with npm test, npm run build and browser checks. Document exact run/configuration instructions and pending real-provider verification.

## Verification outcome

2026-09-20: 12 domain/protocol tests passed; production build and TypeScript passed. Browser verified automatic local email capture, code authentication, create, reschedule, cancel, restored availability, logout, and UA/DE/EN content. Fixed a success-message translation issue discovered during that flow. No browser console errors observed. Desktop layout inspected; a requested 390px viewport remained 1280px in this browser runtime, so mobile rendering is not verified. No real OpenAI speech or SMTP delivery was attempted because credentials are absent. Google Calendar, Postgres migration and Vercel deployment remain deferred. Development server is running on 127.0.0.1:3000.
