# Read-only calendar overview implementation plan

**Goal:** Show selected doctor calendars together with Google busy intervals, local bookings and the existing work schedule.
**Architecture:** An authenticated read-only endpoint combines Google FreeBusy with local confirmed intervals. Pure schedule/segmentation functions produce per-day lanes; a standalone client component renders and filters them.
**Tech Stack:** Next.js App Router, React, Luxon, Google Auth Library, existing SQLite and CSS.
**Execution:** Inline; user approved the read-only multi-calendar direction. Preserve existing booking controls and do not add Google writes.

## Task 1: Read-only calendar data
- [x] Add `src/lib/schedule.ts` with existing weekday hours, lunch, slot increment and lead time. Replace equivalent literals in `booking.ts` without changing behavior.
- [x] Add `src/lib/calendar-overview.ts`: types and pure lane partitioning using clipped busy intervals plus working/break boundaries; retain local/Google source labels, closed weekends and unknown lanes on provider errors.
- [x] Add `src/lib/google-calendar.ts`: server-only doctor/environment mapping, scoped GoogleAuth client, one FreeBusy request for all configured doctors, validate provider intervals and handle per-calendar failures without claiming availability.
- [x] Add authenticated `GET /api/calendar?date=YYYY-MM-DD&view=day|week`: bounded range, user rate limit, local `SELECT doctor_id,start,end` for confirmed overlaps, no patient data, no-store response.

## Task 2: Calendar interface
- [x] Add `src/components/calendar-overview.tsx` and localized `src/lib/calendar-copy.ts`: all-doctor toggles, day/week/date navigation, manual and visibility-aware 30-second refresh, loading/error/empty-selection states and accessible labels.
- [x] Render per-day doctor lanes with absolute interval blocks and a common hour axis; add a status legend and last-updated timestamp. No event editing, selection for booking or mutations.
- [x] Mount as a separate full-width dashboard block. Add scoped CSS preserving warm clinic palette and internal horizontal scrolling on narrow screens.

## Task 3: Verify and document
- [x] Add `tests/calendar.test.ts` for source overlap, lunch/weekend/DST, invalid input, missing calendar responses and provider errors. Run all domain/protocol tests and build once after implementation.
- [x] Exercise the real read-only API with configured credentials, verify unauthenticated access is rejected and no secrets/patient fields enter the response.
- [x] Inspect browser rendering, filters, day/week/date controls, refresh and locales. Record any unavailable viewport verification honestly.
- [x] Update README and integration proposal to distinguish working Google calendar viewing from pending Google event creation/reschedule/cancellation.

## Verification outcome — 2026-09-21

- All 23 tests passed, including interval overlap/source attribution, exclusive boundaries, lunch/weekends, Vienna DST, elapsed time, range validation and failed/missing provider calendars. Production build and TypeScript passed.
- Real authenticated endpoint returned all three configured Google calendars ready. Unauthenticated request returned 401; invalid date/range returned 400. Response contained no calendar IDs, patient fields or booking IDs. These were read-only Google calls.
- Browser verified all/one/no-doctor selection, day/week and next-day/today controls, three locale labels, and live local-booking refresh. A synthetic local Anna Weber booking appeared as busy 09:00–09:30 on September 22, with Local demo attribution. It was then cancelled and the overview restored to the current workweek.
- Visible screenshot inspected at the actual 629×1044 viewport; no document-level horizontal overflow. Calendar scrolling remains internal. A separate 390px mobile viewport was not verified. Full-page capture showed browser stitching artifacts; visual assessment used the normal viewport screenshot and DOM.
- Browser console had no errors. README and integration proposal explicitly distinguish this working read-only overview from pending Google booking mutations.
