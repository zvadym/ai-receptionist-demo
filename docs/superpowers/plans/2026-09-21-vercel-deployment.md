# Implementation plan

1. Link Vercel project/GitHub and provision free Neon in Frankfurt after user accepts terms.
2. Replace SQLite calls with PostgreSQL queries, async transactions and PGlite local storage. Adapt auth, bookings, tools, routes and tests together. Provide a SQLite importer.
3. Configure voice streaming lifecycle, provider cleanup, production credentials and origins.
4. Validate concurrent booking/link/cap behavior, existing tests and production build.
5. Deploy, verify public and authenticated flows, commit/push deployment changes and report URL and actual remaining limitations.

## Verified before provisioning

- Vercel project linked to GitHub; deployment-specific assigned domain omitted.
- Production secrets and configuration uploaded without committing credentials; backend model is `gpt-5.6-terra`.
- 33 automated tests passed, production build passed.
- Real Gleam voice smoke passed create, reschedule and cancel with separate spoken confirmations (162 seconds).
- Inline service-account credentials successfully read all three Google calendars.
- Local SQLite data imported into PGlite; original SQLite file retained.
- Initial provisioning waited for the account holder to accept marketplace terms; this was resolved in the update below.

## Provisioning update

The deployment uses a custom domain. Set APP_ORIGIN to the actual HTTPS origin; `demo.example.com` is a documentation placeholder. Cleanup cron runs every 15 minutes so an idle Neon database can scale to zero; normal voice sessions still close after five minutes, but recovery after a terminated server process may wait up to 15 minutes. Free-plan usage limits still apply.

## Production verification

- Neon Free resource `linden-demo` provisioned in Frankfurt and connected to Vercel.
- Production deployed from GitHub main; custom HTTPS domain verified and publicly accessible.
- Real Neon concurrency checks passed for same-slot bookings, one-use access redemption and voice reservations.
- Browser access redemption, authenticated calendar display and a complete manual booking/cancellation passed on the custom domain.
- Production local mailbox is unavailable (404); unauthenticated cleanup calls are rejected (401).
- Email delivery is configured through Resend. End-to-end delivery awaits the user's test recipient; no test email has been sent.
- Real production WebRTC smoke passed with synthetic Opus speech, Gleam voice, backend tool execution and provider-confirmed closure (34 seconds, one persisted tool result). Earlier silent-peer attempts did not exercise a patient utterance; no application workaround was needed.
