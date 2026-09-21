# Implementation plan

1. Link Vercel project/GitHub and provision free Neon in Frankfurt after user accepts terms.
2. Replace SQLite calls with PostgreSQL queries, async transactions and PGlite local storage. Adapt auth, bookings, tools, routes and tests together. Provide a SQLite importer.
3. Configure voice streaming lifecycle, provider cleanup, production credentials and origins.
4. Validate concurrent booking/link/cap behavior, existing tests and production build.
5. Deploy, verify public and authenticated flows, commit/push deployment changes and report URL and actual remaining limitations.

## Verified before provisioning

- Vercel project linked to GitHub; assigned domain: `example-project.vercel.app`.
- Production secrets and configuration uploaded without committing credentials; backend model is `gpt-5.6-terra`.
- 33 automated tests passed, production build passed.
- Real Gleam voice smoke passed create, reschedule and cancel with separate spoken confirmations (162 seconds).
- Inline service-account credentials successfully read all three Google calendars.
- Local SQLite data imported into PGlite; original SQLite file retained.
- Neon provisioning is blocked by the account holder accepting marketplace terms. Production database, deployment and public verification remain pending; do not describe the site as deployed.
