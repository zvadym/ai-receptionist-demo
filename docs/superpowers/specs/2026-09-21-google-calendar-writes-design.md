# Google Calendar booking synchronization

Use the existing three service-account calendar mappings for real event creation, rescheduling and cancellation. The shared web/voice booking boundary retains ownership and separate confirmation. Google events participate in slot lookup, including recurring and all-day busy events; only the precise owned event is excluded when moving a booking. Failed reads never mean free time.

Private events contain the service, patient name, verified email, optional phone and a concise visitor-provided reason (service name when no further details were provided). No attendees or invitations. Voice preparation accepts these details; the web form supplies defaults and optional visit notes.

Persist an immutable calendar-operation intent before a remote mutation, reserve its target interval, then apply it with deterministic event IDs and an operation marker. Successful Google response and the final local booking/proposal result are persisted together. A transport failure leaves a retryable intent; repeating it or the existing maintenance cron reconciles it without duplicate insertion. Existing-event changes use the etag captured in the preview, rejecting manual edits. Known conflicts release the intent and require a new preview; uncertain changes cannot be dismissed or replaced.

For this small demo the existing PostgreSQL advisory transaction lock serializes mutations, including bounded Google calls after the intent is committed. Google has no atomic reserve-if-free API, so an external calendar writer can still race a check. This is application-to-Google synchronization; external events block availability but external edits are not silently copied into owned bookings.

Export existing future internal bookings with the same durable mechanism, skipping/rejecting conflicts. Never invent missing historical symptom summaries. Verify a synthetic lifecycle in each actual doctor calendar, then deploy and verify an authenticated production lifecycle and existing-booking export.
