# Google Calendar integration proposal

Status (2026-09-21): calendar writes implemented with PostgreSQL operation intents, deterministic Google event IDs, etag protection, patient/contact/summary payloads and retry reconciliation. Real create/read/move/read/delete checks passed for all three doctor calendars. The sections below retain the original integration design; current implementation details are in `../superpowers/specs/2026-09-21-google-calendar-writes-design.md`.

## Deployment-specific setup

Create your own Google Cloud project, enable the Google Calendar API and share three dedicated calendars with a service account. Keep its JSON credential in ignored local storage or your deployment's secret manager. No project-wide administrator role or domain-wide delegation is needed for explicitly shared calendars.

The three demo doctors are fictional. Supply your own server-only calendar IDs:

| Fictional doctor / service | Environment variable |
| --- | --- |
| Anna Weber / checkup | `GOOGLE_CALENDAR_ANNA_WEBER` |
| Max Hoffmann / cleaning | `GOOGLE_CALENDAR_MAX_HOFFMANN` |
| Lara Fischer / filling | `GOOGLE_CALENDAR_LARA_FISCHER` |

Use `Europe/Vienna` for this demo and grant the service account writer access to each calendar. Never accept calendar IDs from the browser or model. The overview reads availability; confirmed booking mutations write private events.

## Scope

Connect one user-owned Google Calendar per configured doctor: Anna Weber/checkup, Max Hoffmann/cleaning, Lara Fischer/filling. Preserve the current shared booking logic for voice and web, explicit confirmation, owner-scoped modifications, language behavior and business hours in Europe/Vienna.

Recommended authentication: a Google Cloud service account granted writer access to these three calendars. Alternative: Google OAuth with offline access and securely stored refresh credentials, appropriate when independent clinics need a self-service connection flow. The backend needs its own credentials; connecting a Calendar app to Codex does not itself authorize the running web application.

## Event and customer details

The event title contains the service and patient name. The description contains patient name, email, optional phone, doctor, service, short visit summary and booking reference. Use the existing authenticated name/email as defaults; allow the visitor to correct patient details before confirming. Require at least one usable contact method and a concise visit reason. Do not require the visitor to dictate an email already verified during sign-in.

The assistant summarizes only information actually provided by the visitor, without a diagnosis or full transcript. The preview includes the patient/contact details and summary as well as the doctor, service, date and time; the voice assistant asks one missing-detail question at a time. The manual web flow needs the same data fields.

Example:

    Title: Professional cleaning — Demo Patient
    Patient: Demo Patient
    Email: patient@example.test
    Phone: +43 … (only if supplied)
    Doctor: Dr. Max Hoffmann
    Service: Professional cleaning, 60 minutes
    Summary: Requests routine professional cleaning; no additional concerns reported.
    Booking reference: <application reference>

Contacts are description fields, not Google event attendees. This avoids unsolicited invitations and does not require domain-wide impersonation for attendee management. Mark events private and busy; calendars must remain non-public.

## Availability and booking lifecycle

Google events, including manually entered busy events, recurring instances and all-day blocks, must participate in availability alongside clinic hours and in-progress application reservations. Fetch events with pagination and expanded recurrence; ignore cancelled or transparent events. For rescheduling, exclude only the appointment's exact event ID, never subtract a merged FreeBusy interval that could hide another event.

Persist doctor-to-calendar mapping on the server. Store calendar ID, deterministic event ID, event link and etag with each Google-backed booking. Never accept arbitrary calendar IDs from the model or browser. Existing local demo appointments remain local and are not automatically exported to Google.

Confirmation rechecks availability, serializes changes for the doctor within the application and creates the Google event. Report confirmed success only once the remote result is known and persisted. Durable operation state plus a deterministic Google event ID lets a retry reconcile a timeout or process failure without inserting another appointment. A timeout with uncertain outcome must not be described as a confirmed booking or definite failure.

Rescheduling changes the existing event; cancellation deletes that event. Read the event and use conditional modification (If-Match/etag) so manual edits are not silently overwritten. Only owned application bookings can be changed. Calendar/auth failures are surfaced rather than silently falling back to local bookings. An external writer can still add an overlapping event between an availability read and insert: Google Calendar does not provide an atomic reserve-if-free operation.

The current SQLite transactions and synchronous tool router must be adapted for asynchronous API calls; do not hold a synchronous database transaction across awaited network requests. Keep existing domain authorization and confirmation rules as the shared boundary.

## Setup if choosing service-account access

1. Create/select a project in Google Cloud Console and enable Google Calendar API.
2. Create a service account. No project-wide administrator role or domain-wide delegation is needed for this proposed shared-calendar flow.
3. Create three secondary calendars in Google Calendar, one for each doctor; use Europe/Vienna.
4. Share each calendar with the service account's email, granting permission to make changes to events (writer). Workspace policies may restrict sharing; verify actual access before enabling bookings.
5. Copy each Calendar ID from its settings (Integrate calendar). These IDs identify the doctor's calendar and are separate from calendar share URLs.
6. Place the service account JSON credential at `.data/google-calendar-service-account.json`, which is already ignored by Git. Do not paste its private key in chat. Supply the three calendar IDs with their doctor mappings. Runtime environment configuration will reference the local credential path; deployment secrets are a separate later step.

Start with read-only access verification of all three mappings. Then exercise create/read-back/reschedule/read-back/delete/read-back using clearly named synthetic appointments in the designated demo calendars.

## Verification plan

- Per-doctor availability, manual busy events, all-day events, recurring events, transparent events and pagination.
- Correct customer fields/summary and doctor-to-calendar mapping.
- Preparation never writes Google events; fresh confirmation is still required.
- Repeated confirmations, timeout reconciliation and duplicate event ID recovery.
- Same-doctor concurrent attempts and independent doctors at the same time.
- Ownership, invalid mapping, revoked access and provider errors.
- External event edits reject stale previews; no destructive overwrite.
- Async tool outputs complete before model continuation; shutdown does not fabricate tool success.
- Live lifecycle verification only after credentials and target calendar IDs are configured.

Official references consulted:

- https://developers.google.com/workspace/calendar/api/concepts/sharing
- https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
- https://developers.google.com/workspace/calendar/api/guides/version-resources
- https://developers.google.com/identity/protocols/oauth2/service-account

## Implemented read-only overview — 2026-09-21

The separately approved calendar block reads mapped Google busy intervals and displays them with local confirmed reservations, working hours and lunch. It supports doctor multiselect, day/workweek navigation and refresh, with no Google mutations. Google FreeBusy is sufficient for this display because no event is being excluded or modified. Event-list pagination, etags, contact/summary fields and durable mutation reconciliation in the proposal above remain requirements for the future booking-write integration. No patient data is exposed by the overview.
