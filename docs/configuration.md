# Configuration and deployment

Start with the [README](../README.md) and copy [`.env.example`](../.env.example) to `.env.local`. Keep credentials server-side; do not prefix them with `NEXT_PUBLIC_`.

## Local development

Use Node.js 22. `npm run dev` listens on `127.0.0.1:3000`. Local storage uses embedded PostgreSQL through PGlite in `.data/postgres`; set `APP_DATA_DIR` to use another directory. No external database is needed.

With `MAIL_MODE=local`, request access using synthetic details and open `/dev/mail` through **Open development inbox**. Messages are captured locally, not delivered. Access links expire after 30 minutes, work once and require an explicit confirmation before sign-in. The authenticated cookie lasts seven days. The local inbox is disabled in production and rejects non-loopback hostnames.

Leave `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_SERVICE_ACCOUNT_JSON` and the three calendar IDs blank for local-only booking. The separate Google Calendar overview reports that it is not configured; local booking still works.

The demo uses weekdays, 09:00–17:00 with a 12:00–13:00 break, in Europe/Vienna. Starts are on half-hour boundaries with a 30-minute lead time; selectable dates cover the next 21 days. Times are stored in UTC and account for Vienna daylight-saving changes. Each fictional clinician has a separate service/calendar mapping in `src/lib/clinic.ts`.

## Live voice

Set `OPENAI_API_KEY`, restart the app, allow microphone access and press **Start a conversation**. The implementation targets `gpt-live-1` via `/v1/live/sessions` and uses `gpt-5.6-terra` for delegated reasoning by default (`LIVE_BACKEND_MODEL` is configurable). Check that your API project has access to these models before enabling voice. The repository does not guarantee model availability for every account.

WebRTC carries audio between the browser and OpenAI. A server-side connection executes tools through the shared booking layer. The assistant prepares a change, asks for confirmation and commits after the next affirmative reply. Doctor and service information comes from tools rather than a duplicated prompt catalog.

Sessions normally close at five minutes. Limits allow three starts per visitor and twenty globally per rolling 24 hours; failed starts also consume quota. These are session limits, not a dollar budget. Real API calls, including the optional smoke tests, incur provider charges.

Unit tests cover protocol fixtures. Real microphone/speaker behavior, interruptions, ambiguous confirmations and provider billing require separate validation. Historical verification notes in `docs/superpowers/` describe earlier runs, not a current service guarantee.

## Email and contact form

For external access-link delivery, configure a verified Resend sender:

```dotenv
MAIL_MODE=resend
RESEND_API_KEY=your-resend-key
RESEND_FROM=Linden AI <demo@your-verified-domain.example>
APP_ORIGIN=https://demo.example.com
CONTACT_EMAIL=maintainer@example.com
```

Replace every example with your own settings. `APP_ORIGIN` controls the origin in access emails independently of incoming Host headers. For local work, use `http://localhost:3000` and open the app at that address. Disable click tracking for authentication-link emails and verify fragment preservation with the recipient's mail client.

`CONTACT_EMAIL` is the server-only destination for contact-form notifications. In Resend mode, a missing or invalid recipient causes a delivery error without sending a notification; the request is retained with a failed status. Local mode captures contact messages without requiring a recipient. `LINKEDIN_PROFILE_URL` is optional and intentionally public when configured.

Access and contact requests persist names, emails and submitted details in the database. Provider acceptance is recorded as `sent`; it does not prove inbox delivery. Production never falls back to the local inbox. Legacy OTP endpoints use the optional SMTP variables in `.env.example`; the landing page uses access links.

## Google Calendar

Create your own Google Cloud project and service account, enable the Calendar API, and share three dedicated test calendars with that account with writer permissions. Use synthetic records while validating the integration.

For local development, store the JSON key at `.data/google-calendar-service-account.json` and set:

```dotenv
GOOGLE_APPLICATION_CREDENTIALS=.data/google-calendar-service-account.json
GOOGLE_CALENDAR_ANNA_WEBER=your-checkup-calendar-id
GOOGLE_CALENDAR_MAX_HOFFMANN=your-cleaning-calendar-id
GOOGLE_CALENDAR_LARA_FISCHER=your-filling-calendar-id
```

For hosted deployments, store the complete JSON credential in the secret `GOOGLE_SERVICE_ACCOUNT_JSON` instead of committing a key file.

The read-only overview combines selected calendars in day/workweek views and refreshes every 30 seconds while visible. Failed reads display unavailable, never free. Calendar IDs and external event details are not returned to the browser.

Confirmed bookings create private Google events containing patient name, contact details and a concise visit summary. Rescheduling and cancellation update the mapped event. No invitations are sent. Durable operation intents, deterministic event IDs and etags support retries and detect manual edits. A booking is reported successful only after Google acknowledges it. Google Calendar does not offer atomic slot reservation against independent external writers.

Existing local bookings are not automatically exported. For an explicitly intended export, use `scripts/sync-google-bookings.ts` with the target database and credentials. See [integration notes](integrations/google-calendar-proposal.md) for the design and validation scenarios.

## Vercel deployment

Configure your own Vercel project, PostgreSQL database and HTTPS origin. Set `DATABASE_URL`, `APP_ORIGIN`, a random `CRON_SECRET`, and the credentials for the services you enable. Production requires a database URL on Vercel and does not upload local data automatically.

The committed `vercel.json` selects `fra1` and schedules maintenance every 15 minutes. Maintenance retries pending calendar operations and attempts to close stale voice sessions. Normal stream cleanup uses `waitUntil`; abrupt termination relies on maintenance. Provider expiry can release a session lock without proving final usage was received. Provider usage remains the billing authority.

Use a separate database and matching origin for preview deployments. Validate your deployment's function-duration and cron support. Run tests and build before deploying. If updating an existing deployment after the contact-address cleanup, set `CONTACT_EMAIL` to your notification address; it no longer has a hardcoded default.

## Maintenance and optional checks

```sh
npm test
npm run typecheck
npm run build
```

Tests cover authentication, authorization, booking conflicts, replay, confirmation expiry, calendar recovery and protocol fixtures. The concurrency tests run against local PGlite; they do not replace verification against a hosted PostgreSQL deployment.

The following commands are opt-in and can contact external services. Review the scripts and target configuration first:

```sh
# Paid voice smoke test; macOS say and afconvert are required.
node --env-file=.env.local --import tsx scripts/live-smoke.ts uk de en

# Check proactive booking dialogue with synthesized speech.
node --env-file=.env.local --import tsx scripts/live-smoke.ts --proactive uk de en

# Import a legacy SQLite database into an empty destination.
# Stop the app first. The script preserves the source file.
node --env-file=.env.local --import tsx scripts/import-sqlite.ts
```

Voice smoke tests use a separate PGlite database and save transcripts/audio in ignored `.data/live-smoke-*` paths. They do not test physical browser audio capture. Never publish local databases, service-account keys, transcripts, access-link messages or deployment environment files.
