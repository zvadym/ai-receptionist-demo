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

2026-09-21 prompt correction plan: update voice flow and delegation triggers in src/lib/live.ts; align the backend lookup/confirmation procedure, find_available_slots description and greetingCommand. Extend scripts/live-smoke.ts with --proactive: vague appointment request -> tooth pain -> automatic slot lookup -> refusal with no prepared or committed booking. Run real spoken scenarios and inspect the returned offer; run build/type checking after the changes. No calendar schema or transport changes are required.

2026-09-20: 12 domain/protocol tests passed; production build and TypeScript passed. Browser verified automatic local email capture, code authentication, create, reschedule, cancel, restored availability, logout, and UA/DE/EN content. Fixed a success-message translation issue discovered during that flow. No browser console errors observed. Desktop layout inspected; a requested 390px viewport remained 1280px in this browser runtime, so mobile rendering is not verified. No real OpenAI speech or SMTP delivery was attempted because credentials are absent. Google Calendar, Postgres migration and Vercel deployment remain deferred. Development server is running on 127.0.0.1:3000.

### Proactive behavior verification — 2026-09-21

- Production build and TypeScript passed after prompt changes.
- Real GPT-Live smoke run with `--proactive uk de en` passed for all three languages; artifacts: `.data/live-smoke-1789978565593`.
- Each scenario clarified a vague appointment request once, then called `get_clinic_info` and `find_available_slots` automatically after the caller described tooth pain. Each spoken offer included Dr. Anna Weber, a 30-minute examination, EUR 65, and three checked times, without the caller asking to search the calendar.
- Declining the offer left no pending proposal and no booking in the isolated test database. All three sessions closed with final usage (72, 67, and 57 seconds).
- These runs establish the tested behavior with synthetic speech; they do not guarantee every future model response. Existing booking authorization and confirmation logic was unchanged.

### Tool-sourced doctors and adapted user prompt — 2026-09-21

User requests adopting their role/language/style/responsibilities/accuracy prompt and sourcing doctors and availability from tools. Keep the existing fictional Linden Dental identity, Vienna timezone and one-doctor calendar; do not invent additional practitioners or change storage topology.

1. Remove embedded catalog/doctor facts from model instructions. Adapt user headings, localized assistant name, natural language switching, concise one-question turns, interruption and medical limits; retain proactive offers and explicit confirmation.
2. Expose the configured doctor through `get_doctors`. Require a validated doctor ID for availability and new booking previews. Return doctor/service/price/timezone alongside slots and owned appointment results. The calendar remains explicitly single-doctor.
3. Test tool-source separation, invalid doctor rejection, doctor association through booking CRUD and existing booking protections. Update opt-in real speech tests to require doctor lookup and correct future-date booking, then verify actual tool use and production build.

Verification completed:
- 14 domain/protocol tests passed, including tool-only doctor sourcing, rejection of invented doctor IDs and consistent doctor association across booking CRUD. Production build and TypeScript passed.
- Real Ukrainian proactive run passed: get_clinic_info -> get_doctors -> find_available_slots; response gave the retrieved clinician, specialty, 30-minute examination, EUR 65 and two returned times. Refusal left no proposal/booking. Final session usage: 70 seconds. Artifacts: `.data/live-smoke-1789981538247`.
- Real English run passed: retrieved roster and availability, prepared/confirmed a future appointment, rescheduled and cancelled with separate affirmative replies. Doctor identity stayed consistent in every tool result. Final usage: 154 seconds. Artifacts: `.data/live-smoke-1789981566580`.
- These runs use synthesized audio against the real model and isolated test databases. German and mid-conversation language switching were not rerun for this revision; multi-doctor scheduling remains out of scope.

### One doctor per service — 2026-09-21

Add three fictional doctors, one for each existing service, with independent availability. Persist doctor_id on appointments and proposals; enforce service eligibility and per-doctor overlap checks. Migrate existing demo bookings by service without deleting appointments, expire old unconfirmed previews, preserve cached confirmed results' doctor association. Update tools and UI to show the assigned doctor. Verify migration, same-doctor collisions, simultaneous different-doctor bookings, wrong service/doctor pairs and rescheduling ownership. No model or transport changes.

Verification: 16 tests passed, including legacy migration, doctor/service mismatch rejection, same-doctor collision protection and simultaneous appointments with different doctors. Production build and TypeScript passed. Real English GPT-Live proactive cleaning scenario retrieved the roster and selected Dr. Max Hoffmann, quoted 60 minutes / EUR120 and offered checked times; refusal produced no booking or proposal. Session finalized at 53 seconds. Artifacts: `.data/live-smoke-1789982856513`. Other languages were not rerun for this calendar revision.

Browser verification: all three service cards show their assigned doctors; selecting cleaning updates the calendar to Max Hoffmann, and the booking preview shows him with the correct 60-minute interval. Dismissed the preview without creating a booking.

## Conversation preference correction — 2026-09-21

Implement the user's explicit conversation order in voice instructions, backend instructions and slot-tool description. Update the real proactive speech scenario to verify no early slot lookup, no-preference earliest lookup, a specific alternate date/time request, and refusal without a proposal. Run the Ukrainian real-model scenario and TypeScript check. Keep calendar and booking authorization unchanged.

### Preference-flow verification

TypeScript passed. Real Ukrainian GPT-Live proactive scenario passed with artifacts `.data/live-smoke-1789991087916` and finalized usage 121 seconds. The agent asked for doctor/time preferences; no slot tool ran before the explicit no-preference answer. It then retrieved clinic/roster/slots, offered two earliest times and invited another approximate day/time. On a request for September 22 after 15:00 it rechecked that date and offered 15:30/16:00. Refusal created neither a booking nor a proposal. This revision was exercised with synthesized Ukrainian speech; German/English were not rerun. Prompt behavior remains generative rather than a deterministic dialogue state machine.
