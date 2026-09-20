# Linden Dental — local voice booking demo

Ukrainian, German and English web UI. Automatic one-time email codes, a fictional dental clinic and a persistent local calendar. Real GPT-Live 1 transport and server-side tools are implemented; microphone conversations require an OpenAI API key with access to that model.

## Run locally

Node.js 22.6 or later (tested on 22.22.2).

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open http://127.0.0.1:3000. The development server binds to loopback only. With the default local mail mode, use any test email, request a code and open **Test inbox** to read the automatically generated email. Messages are captured locally, not delivered to the internet. Codes expire after ten minutes and work once; the authenticated cookie lasts seven days. The local inbox is disabled in production and rejects non-loopback hostnames.

The calendar works without any external service. Select a treatment and date, select a slot, then confirm. You can reschedule or cancel your own appointments. All state is stored in `.data/booking.sqlite` (ignored by git). Slots are weekdays, 09:00–17:00 with a 12:00–13:00 break, in Europe/Vienna, over the next 21 days. Times are stored in UTC; daylight-saving changes are accounted for. This is a fictional clinic, not a medical service.

## Connect real voice

Set `OPENAI_API_KEY` in `.env.local`, restart the development server, allow the microphone and press **Start a conversation**. Never use a `NEXT_PUBLIC_` variable for the key. The key must belong to an API project that supports `gpt-live-1`, with billing enabled. ChatGPT and Vercel subscriptions do not include OpenAI API charges.

- Voice: `gpt-live-1` through `POST /v1/live/sessions`, WebRTC media directly between browser and OpenAI.
- Reasoning/tools: Responses delegation, `gpt-5.6-luna` by default (`LIVE_BACKEND_MODEL` is configurable).
- Sideband: the server attaches to `/v1/live/sessions/{id}/attach` and is the sole tool executor.
- An authenticated streaming HTTP request owns the local server connection. The server closes at five minutes or when the HTTP stream disconnects, waits for `session.closed`, and records incomplete finalization separately.
- Up to three starts per visitor and twenty starts globally per rolling 24-hour window. A start reserves quota before calling OpenAI, including failed starts. This is a session-count cap, not a precise dollar budget; backend token usage is additional.
- Tools prepare a change, ask for confirmation and commit after the next affirmative reply. The same preview is displayed in the UI and may also be confirmed there. Voice interpretation of consent still needs real-model evaluation. For real clinic use, stronger identity verification and a reviewed confirmation policy are required.

Real-provider voice, audio interruption, multilingual recognition, sideband timing and final billing have **not** been validated without credentials. No mock speech is presented as a working OpenAI session. Abrupt server process termination cannot run the close handler; a failed sideband attach is recorded as incomplete and requires provider-side usage review. Before public deployment, add an independent expiry/reconciliation mechanism and validate actual provider session expiration.

## Send real email instead of using the test inbox

Configure your SMTP provider:

```dotenv
MAIL_MODE=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-user
SMTP_PASS=your-password
SMTP_FROM=Linden Demo <demo@your-verified-domain.example>
```

Port 465 uses implicit TLS; other ports use the transport's STARTTLS support. SMTP delivery errors do not return a success message. Real delivery has not been tested without credentials. Production never falls back to a local inbox.

## Checks

```sh
npm test
npm run build
```

Domain tests cover code reuse/expiry/lockout, authorization, overlapping bookings, replay, proposal expiry, cancellation/rescheduling, Vienna DST and the Live nested tool event protocol. Provider protocol tests use event fixtures; they do not prove a real voice conversation works.

## Before Vercel deployment (deferred)

This is deliberately a local build; `VERCEL` environments fail closed on SQLite access. Replace `src/lib/db.ts` and synchronous SQLite transactions with durable Postgres transactions and shared rate-limit state, then configure real mail delivery. Connect a dedicated Google Calendar if desired; the current calendar is local, not synced with Google. Add durable voice expiry/usage reconciliation, deployment-specific origin validation, access abuse controls and real-provider smoke tests on Preview before Production. No deployment has been made.

References: [GPT-Live](https://developers.openai.com/api/docs/guides/live), [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live), [delegation](https://developers.openai.com/api/docs/guides/live-delegation), [server controls](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live).
