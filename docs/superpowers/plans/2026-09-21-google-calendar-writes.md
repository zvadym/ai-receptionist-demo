# Implementation plan

1. Extend Google API adapter with paginated event availability, private event payloads, deterministic IDs, bounded authenticated requests and conditional changes.
2. Add patient/calendar metadata and durable operation schema; integrate Google availability and durable confirmation in the shared booking engine. Keep confirmation tool outside the surrounding tool-cache transaction so intents commit before side effects.
3. Add voice summary/contact arguments, manual notes/default identity, localized failure messages and truthful calendar copy. Reuse the existing maintenance cron for pending-operation recovery.
4. Verify timeout recovery, duplicate confirmation, conflicts, owner boundaries, manual edits, all-day/recurring pagination and failure behavior with isolated database/provider tests; run existing tests and production build.
5. Run synthetic live Google lifecycle, export future production bookings, commit/push, verify production and report exact results.

## Verification before deployment

- 39 tests pass, including retry after an ambiguous remote insert and process restart, pending-slot reservation, concurrent confirmation, external event conflicts, etag protection, pagination/all-day handling, maintenance recovery and legacy export.
- TypeScript and production build passed.
- Live Google API lifecycle passed in all three calendars; synthetic events deleted.
- Production database contains two future internal bookings awaiting export (Anna and Max).
