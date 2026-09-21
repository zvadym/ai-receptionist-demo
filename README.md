# Linden AI — clinic receptionist demo

English-first marketing landing with German (`?l=de`) and Ukrainian (`?l=uk`, also `ua`) variants, localized CRM/medical-software examples and automatic access links. A fictional dental clinic and persistent local calendar power the authenticated demo. Real GPT-Live 1 transport and server-side tools are implemented; microphone conversations require an OpenAI API key with access to that model.

## Run locally

Node.js 22.6 or later (tested on 22.22.2).

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open http://127.0.0.1:3000. The development server binds to loopback only. The public landing stays at `/`; the authenticated application is `/demo`. With the default local mail mode, use a test email, request access and open **Test inbox** to read the generated link. Messages are captured locally, not delivered to the internet. Access links expire after 30 minutes and work once; the authenticated cookie lasts seven days. The local inbox is disabled in production and rejects non-loopback hostnames.

The calendar works without any external service. Select a treatment and date, select a slot, then confirm. You can reschedule or cancel your own appointments. All state is stored in `.data/booking.sqlite` (ignored by git). Slots are weekdays, 09:00–17:00 with a 12:00–13:00 break, in Europe/Vienna, over the next 21 days. Times are stored in UTC; daylight-saving changes are accounted for. This is a fictional clinic, not a medical service.

## Connect real voice

Set `OPENAI_API_KEY` in `.env.local`, restart the development server, allow the microphone and press **Start a conversation**. Never use a `NEXT_PUBLIC_` variable for the key. The key must belong to an API project that supports `gpt-live-1`, with billing enabled. ChatGPT and Vercel subscriptions do not include OpenAI API charges.

- Voice: `gpt-live-1` through `POST /v1/live/sessions`, WebRTC media directly between browser and OpenAI.
- Reasoning/tools: Responses delegation, `gpt-5.6-luna` by default (`LIVE_BACKEND_MODEL` is configurable).
- Sideband: the server attaches to `/v1/live/sessions/{id}/attach` and is the sole tool executor.
- An authenticated streaming HTTP request owns the local server connection. The server closes at five minutes or when the HTTP stream disconnects, waits for `session.closed`, and records incomplete finalization separately.
- Up to three starts per visitor and twenty starts globally per rolling 24-hour window. A start reserves quota before calling OpenAI, including failed starts. This is a session-count cap, not a precise dollar budget; backend token usage is additional.
- Tools prepare a change, ask for confirmation and commit after the next affirmative reply. The same preview is displayed in the UI and may also be confirmed there. One English create/reschedule/cancel flow has passed with the real model; ambiguous replies and interruptions need broader evaluation. For real clinic use, stronger identity verification and a reviewed confirmation policy are required.
- The receptionist establishes the reason for a visit, asks once for doctor/time preferences unless already supplied, then proactively checks matching availability and offers the clinician, service, price, duration and up to two actual times. An explicit no-preference answer leads to the earliest suitable appointments. Tooth pain does not trigger a diagnostic questionnaire. Each offer invites the visitor to provide an approximate day/time for alternatives. A slot is prepared only after the visitor chooses it; declining an offer creates no booking. Doctor names, specialties and service eligibility come from `get_doctors`; `find_available_slots` requires the returned doctor ID and returns that doctor, service details and checked times. Booking tools reject unknown doctors and return the same doctor throughout preview, confirmation, rescheduling and cancellation. Each service has its own fictional doctor and independent calendar: checkup → Dr. Anna Weber, cleaning → Dr. Max Hoffmann, filling → Dr. Lara Fischer. Appointments persist doctor_id; overlap checks apply per doctor and service/doctor mismatches are rejected. Existing local appointments are migrated by service, and old unconfirmed previews expire. No doctor roster or price catalog is copied into model prompts.

Real API checks on 2026-09-20 used `gpt-live-1` with `gpt-5.6-terra`: Ukrainian/German synthesized questions produced correct service answers and a real knowledge tool call; English speech created, rescheduled and cancelled an isolated test booking with separate confirmations. A Node WebRTC peer exercised the application's session creation and server sideband, reached `session.started`, then closed with final usage persisted. This does not verify physical microphone capture or speaker playback in a browser: the in-app browser's microphone request remained pending. Audio interruptions, the full five-minute timeout and provider billing reconciliation remain unverified. No mock speech is presented as a working OpenAI session.

Abrupt server process termination cannot run the close handler; a failed sideband attach is recorded as incomplete and requires provider-side usage review. Before public deployment, add an independent expiry/reconciliation mechanism and validate actual provider session expiration.

## Send real email instead of using the test inbox

Configure Resend with a sending API key and a verified sender domain:

```dotenv
MAIL_MODE=resend
RESEND_API_KEY=re_...
RESEND_FROM=Linden AI <demo@your-verified-domain.example>
APP_ORIGIN=http://localhost:3000
```

`APP_ORIGIN` determines the email destination independently of incoming Host headers. Keep it at the local URL for local testing; change it to the HTTPS site origin when deployed. A localhost link is usable only on the machine running the demo. A restricted send-only key is sufficient. Configure the sender's Resend domain with click tracking disabled so authentication links are not rewritten; inbox and URL-fragment preservation should be checked with the actual recipient's mail client.

Every valid, rate-limited form submission is saved in `access_requests` with name, normalized email, optional clinic, language, creation time, send status and Resend message ID. `sent` means accepted by the email provider, not proof of delivery. Failed requests remain recorded and their links are invalidated. Issuing a newer link revokes previous links for that address. The 256-bit access token is stored as a hash, expires in 30 minutes and is atomically consumed by a POST after the visitor explicitly presses **Open my demo**. GET previews do not log in or consume the token. The URL fragment keeps the token out of HTTP request URLs; the page clears it from browser history after loading. Reloading that page requires reopening the original link. Development mail capture intentionally stores the link in the ignored local database.

The browser form uses `/api/access/request`; `/api/access/redeem` creates the existing HttpOnly, SameSite=Strict session. Global/email send limits and the existing voice-session quotas remain active. Production does not fall back to the local inbox. The old OTP helpers remain for existing tests/legacy endpoint compatibility; the landing uses only access links.

The five brand examples vary by locale: international (Salesforce, HubSpot, Zoho, CGM, samedi), German/Austria (CGM, LATIDO, samedi, Salesforce, HubSpot), Ukrainian (HELSI, Doctor ELEKS, Salesforce, HubSpot, Zoho). Logos are sourced from official vendor websites; see `public/integrations/SOURCES.md`. They illustrate potential integrations, not installed connectors, partnerships or a popularity ranking. Phone and WhatsApp are also clearly labeled as custom integrations. The authenticated dashboard and voice behavior are unchanged.

## Checks

```sh
npm test
npm run build
```

Domain tests cover code reuse/expiry/lockout, authorization, overlapping bookings, replay, proposal expiry, cancellation/rescheduling, Vienna DST and the Live nested tool event protocol. Provider protocol tests use event fixtures; they do not prove a real voice conversation works.

For an opt-in **paid** real speech/tool test on macOS (`say` and `afconvert` required):

```sh
node --env-file=.env.local --import tsx scripts/live-smoke.ts uk de en
# Regression: vague booking intent -> tooth pain -> proactive times -> no booking on refusal
node --env-file=.env.local --import tsx scripts/live-smoke.ts --proactive uk de en
```

This streams locally synthesized speech into the real Live WebSocket API and executes the same session configuration, tool router and booking functions used by the app. It uses a separate SQLite database, saves transcripts/audio under ignored `.data/live-smoke-*`, and waits for final session usage. It does not exercise browser capture or the WebRTC sideband. Use `--proactive --service=cleaning en` (or `checkup`/`filling`) to verify a specific service routes to its assigned doctor. Pass a single language for a shorter run; the English scenario includes create/reschedule/cancel. Run manually only, since it incurs API charges and model responses can vary.

## Before Vercel deployment (deferred)

This is deliberately a local build; `VERCEL` environments fail closed on SQLite access. Replace `src/lib/db.ts` and synchronous SQLite transactions with durable Postgres transactions and shared rate-limit state, then configure real mail delivery. The read-only overview already reads the configured doctor Google calendars; booking create/reschedule/cancel still use local SQLite and do not write Google events. Add durable voice expiry/usage reconciliation, deployment-specific origin validation, access abuse controls and real-provider smoke tests on Preview before Production. No deployment has been made.

References: [GPT-Live](https://developers.openai.com/api/docs/guides/live), [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live), [delegation](https://developers.openai.com/api/docs/guides/live-delegation), [server controls](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live).


## Read-only doctor calendars

The separate **Doctor calendars** block combines one or several selected calendars. Each doctor has a colored lane. Day and workweek views, date navigation, manual refresh and a visible-tab 30-second refresh show Google busy intervals alongside confirmed local bookings. Local bookings are labeled as demo data; creation, rescheduling and cancellation are not yet synchronized to Google.

Configure `.env.local` using the keys in `.env.example`: `GOOGLE_APPLICATION_CREDENTIALS` points to the ignored service-account JSON; `GOOGLE_CALENDAR_ANNA_WEBER`, `GOOGLE_CALENDAR_MAX_HOFFMANN`, and `GOOGLE_CALENDAR_LARA_FISCHER` contain the respective calendar IDs. These values stay on the server. The authenticated `GET /api/calendar?date=YYYY-MM-DD&view=day|week` endpoint requests Google FreeBusy with a read-only OAuth scope. Google handles recurring/all-day busy periods; event names, descriptions, patient details and calendar IDs are never returned to the browser. Missing or failed calendar reads display unavailable, not free.

`src/lib/schedule.ts` centralizes the existing demo schedule used by booking and calendar rendering: weekdays 09:00–17:00, lunch 12:00–13:00, half-hour starts and a 30-minute booking lead time, Europe/Vienna. The overview focuses on 08:00–18:00; week view displays Monday–Friday and day view can inspect weekends. Free blocks mean unoccupied working time, not a promise that a particular service fits. Calendar navigation is limited to approximately one year in either direction. There is no schedule editor and no event mutation in this block.

Verification on 2026-09-21: 23 unit/domain/protocol tests and production build passed. Real service-account reads returned ready for all three calendars; unauthenticated access returned 401 and invalid ranges returned 400. Browser checks covered multiple/one/no selected calendars, day/week navigation, UA/DE/EN labels and a local appointment appearing as busy. No Google events were created for this feature.

### Telephony examples on the landing
The integration section lists Twilio, Telnyx, Vonage, Plivo and sipgate.io with official logos and product links. All three languages describe them as custom integration candidates; actual availability depends on country, number and provider capabilities. No provider account, number or telephony connection is provisioned by this UI change.
