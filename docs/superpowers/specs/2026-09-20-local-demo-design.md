# Local booking assistant

Approved conversation decisions: Ukrainian/German/English with a web switcher; automatic email access codes; local implementation first, Vercel deployment later. The user explicitly asked to proceed with the local version after reviewing the architecture.

One Next.js application. Browser WebRTC connects to GPT-Live 1; a server-owned sideband executes private booking tools. The server keeps an HTTP stream open for the conversation lifecycle, stops after five minutes, and tracks incomplete shutdowns. Booking actions have a prepared proposal and explicit confirmation. Tools are restricted to the signed-in user's appointments, and repeated tool calls must not duplicate mutations.

Local storage: SQLite in .data (ignored by git), transactional overlapping-slot checks, one fictional clinician, Vienna timezone, weekdays 09:00–17:00 with lunch 12:00–13:00. Three translated services and clinic information. Local appointment data is persistent. Google Calendar and Postgres migration are deferred to the deployment phase; no Google credentials exist yet.

Access: request a short-lived one-time six-digit code by email, then exchange it for an HttpOnly session. Automatic local mailbox capture supports development without email credentials; SMTP is configurable. Local mailbox must be unavailable in production and non-loopback requests. Requests and verification attempts are rate limited; stored codes and session tokens are hashed. No API secrets reach the browser.

UI: a calm warm-white dental concierge, dark ink typography, restrained teal, clear language switch, access form, voice controls, transcript, service list, available slots and confirmed appointments. Manual booking uses the same domain actions to make the local calendar testable without a model key. No simulated model output is presented as GPT-Live.

Verification: domain tests for calendar overlap, ownership, idempotency, code expiration/reuse and voice event routing; build/type checks; browser flow from local email to booking, rescheduling and cancellation. Real speech verification requires a user-provided OpenAI project key with GPT-Live access. No deployment or external emails are performed in this phase.
