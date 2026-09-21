# Marketing Landing Implementation Plan

> Execute inline in this task. User has authorized implementation; do not add another execution handoff.

**Goal:** A localized promotional page with genuine vendor logos and persistent, Resend-backed access requests.
**Architecture:** Separate root marketing page and authenticated demo. Shared locale resolver; saved request/token lifecycle and existing session cookie; thin Resend transport.
**Tech Stack:** Next.js 16, React 19, TypeScript, SQLite, Resend REST, CSS.

## Constraints
English default; query l controls UA/DE/EN. Preserve existing demo. No live telephony/WhatsApp/CRM claims or Google booking-write claims. Tokens never stored plaintext. Credential values remain ignored.

## Tasks
- [x] Create locale resolver, localized landing copy and sourced vendor catalog/assets. Landing receives a resolved Language from server page searchParams; copy contains all visible labels and disclosures.
- [x] Add access_requests and access_links tables in db.ts schema version 2. Implement requestAccess(input) and redeemAccess(token) in access-links.ts; atomic expiry/one-use/supersession, reuse session auth. Implement Resend delivery in access-mail.ts with injected fetch for tests.
- [x] Update access/request route and add access/redeem route. Persist before sending, preserve failures, no redirect supplied by caller. Add /access confirmation and protected /demo pages.
- [x] Build landing.tsx and scoped landing.css: hero, conversation/calendar artwork, benefits/features, channels, five vendor logos, FAQ, form. Query-based language links; loading/error/success states and accessible labels. Adapt Demo initial language and return-home/logout behavior.
- [x] Add isolated access tests and provider mocks. Run npm test and npm run build; browser verify EN/DE/UK, mobile layout, form and token sign-in; test real Resend with official sink if sender configured.
- [x] Document setup, locale URLs, request inspection, verification outcomes and any remaining external configuration.

Self-review: user requirements map to the tasks above; no clinic/calendar backend rewrite or speculative integration implementation included.


## Verification — 2026-09-21
- All 27 tests passed, including one-use/expiry/supersession, persistent failed applications, mocked Resend acceptance/errors and idempotency.
- Production build and TypeScript passed. A final typecheck passed after adding clickable links to the local mailbox.
- Browser verified English default, German query-selected content and Austria-oriented vendors, Ukrainian content and vendor list. Five real logos loaded and rendered correctly in the inspected integration section.
- Actual 390px mobile and 1440px desktop screenshots inspected; no horizontal page overflow. Temporary viewport restored afterward.
- Submitted a German request for synthetic landing-test@example.test with clinic name; verified its saved request and local capture. Opening the link did not consume it; explicit confirmation signed in and opened /demo?l=de with the correct user.
- Unauthenticated /demo redirected to localized access form; invalid token returned 401, cross-origin redemption 403, invalid form 400.
- Resend transport implemented and mock-tested. Real sending remains unverified: the provided key is send-only, RESEND_FROM is absent, and the user has a pending sender-address question. MAIL_MODE remains local until a verified sender is supplied. No external email sent.
- Telephony, WhatsApp and CRM are advertised as potential custom integrations. Google Calendar booking writes remain outside this landing change.


## Resend activation — 2026-09-21
- User supplied contact@example.test. Configured ignored .env.local with RESEND_FROM="Linden AI <contact@example.test>" and MAIL_MODE=resend.
- Submitted a synthetic request through the running application's /api/access/request endpoint to Resend's documented delivered+booking-demo@resend.dev test sink.
- Endpoint returned HTTP 200, sent=true, mailMode=resend. Persisted request has send_status=sent and provider_id=example-message-id.
- This verifies Resend accepted the real sender and application payload; it does not claim delivery to a human inbox. APP_ORIGIN remains local until deployment.

## Telephony row
- Verify five official provider product pages and obtain genuine logos.
- Add a provider catalog and localized copy; reuse the existing vendor row layout.
- Check TypeScript and rendered desktop/mobile logo rows. No backend changes or new implementation-mirroring tests.


Telephony row verification: TypeScript passed. Browser checked all five loaded logos, EN/DE/UK text, 390px mobile and 1440px desktop layouts without overflow or console errors. Official sources recorded in public/integrations/SOURCES.md. During visual review, corrected the existing white LATIDO wordmark contrast on its white tile using the same treatment as Vonage. No backend or mail changes.
