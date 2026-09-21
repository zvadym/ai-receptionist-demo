# Local booking assistant

Approved conversation decisions: Ukrainian/German/English with a web switcher; automatic email access codes; local implementation first, Vercel deployment later. The user explicitly asked to proceed with the local version after reviewing the architecture.

One Next.js application. Browser WebRTC connects to GPT-Live 1; a server-owned sideband executes private booking tools. The server keeps an HTTP stream open for the conversation lifecycle, stops after five minutes, and tracks incomplete shutdowns. Booking actions have a prepared proposal and explicit confirmation. Tools are restricted to the signed-in user's appointments, and repeated tool calls must not duplicate mutations.

Local storage: SQLite in .data (ignored by git), transactional overlapping-slot checks, one fictional clinician, Vienna timezone, weekdays 09:00–17:00 with lunch 12:00–13:00. Three translated services and clinic information. Local appointment data is persistent. Google Calendar and Postgres migration are deferred to the deployment phase; no Google credentials exist yet.

Access: request a short-lived one-time six-digit code by email, then exchange it for an HttpOnly session. Automatic local mailbox capture supports development without email credentials; SMTP is configurable. Local mailbox must be unavailable in production and non-loopback requests. Requests and verification attempts are rate limited; stored codes and session tokens are hashed. No API secrets reach the browser.

UI: a calm warm-white dental concierge, dark ink typography, restrained teal, clear language switch, access form, voice controls, transcript, service list, available slots and confirmed appointments. Manual booking uses the same domain actions to make the local calendar testable without a model key. No simulated model output is presented as GPT-Live.

Verification: domain tests for calendar overlap, ownership, idempotency, code expiration/reuse and voice event routing; build/type checks; browser flow from local email to booking, rescheduling and cancellation. Real speech verification requires a user-provided OpenAI project key with GPT-Live access. No deployment or external emails are performed in this phase.

2026-09-21 user-requested behavior correction: proactively guide booking. Clarify the reason if unknown; once known, look up the suitable service and earliest/preferred availability without asking permission to search. Offer the real demo clinician, price, duration and 2–3 checked slots, then ask which works. Symptoms route to an examination rather than a diagnosis. Preserve the existing single-clinician calendar and separate confirmation before a booking mutation; do not prepare a booking merely because options were offered. Respect a refusal to book. Apply to both the voice prompt and backend procedure, including the startup greeting.


## Tool-sourced facts and user prompt adaptation — 2026-09-21

Adopt the user-supplied role, language, speaking style, responsibilities and accuracy structure. Use localized administrator names (Софія / Sophie / Sophia), follow a caller's language switch, keep replies concise with one question and at most two time options, and preserve proactive lookup plus separate confirmation. Keep the existing Linden Dental/Vienna identity and clearly disclose the demo.

Clinic services/prices/dates are retrieved from get_clinic_info, doctor roster/specialties/service eligibility from get_doctors, and availability from find_available_slots. Remove embedded doctor/catalog data from both model prompts. Tool calls for availability and new previews require the returned doctor_id; reject other IDs. Enrich appointment-tool results with doctor, service, currency and timezone. The single existing calendar belongs to the one configured doctor; no multi-doctor migration or invented roster is introduced.

### Three doctor calendars — approved 2026-09-21

Each service now has one fictional doctor: Anna Weber for checkups, Max Hoffmann for cleaning, Lara Fischer for fillings. Availability and collision checks are doctor-specific; proposals and bookings persist doctor_id. Rescheduling retains the appointment's doctor. Existing demo bookings are assigned by service during an atomic migration; old pending previews expire to require a fresh review. The UI shows the doctor on services, availability, confirmations and booked appointments. The agent still retrieves the roster from tools rather than its prompt.

## Approved conversation correction — 2026-09-21

The user supplied an actual tooth-pain conversation and requested removal of diagnostic filler, a doctor/time preference question before selection, and an invitation to request alternative times. Tooth pain is sufficient for examination routing. Ask one combined preference question and await the answer; already supplied concrete preferences or an earliest-time request avoid repetition. No preference means earliest suitable options. Offers include at most two verified times and invite an approximate day/time for alternatives. Preserve factual tool use, emergency routing, and fresh explicit confirmation before changes. This replaces the earlier immediate-search-without-preferences flow.
