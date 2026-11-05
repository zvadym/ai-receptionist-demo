# Core and clinic demo

Linden AI is being developed around a reusable core for AI receptionists and conversational booking. The dental clinic is the current example application, with its own services, clinicians, copy and presentation.

## Current implementation

Both live in one Next.js application today. There is no separately packaged core or general-purpose plugin API yet. The shared logic still imports clinic-specific data and policies; the distinction below describes responsibilities and the intended separation, rather than an extraction that has already happened.

### Core responsibilities

- Voice session lifecycle and server-side tool execution.
- Availability, booking, rescheduling and cancellation.
- Preparing changes for review and committing them after explicit confirmation.
- Authentication, booking ownership, replay protection and persistence.
- External calendar synchronization and email delivery.

Web controls and voice tools use the same booking logic. The server owns credentials and mutations. The current integrations include OpenAI voice, Google Calendar and Resend email delivery; local development can use PGlite and captured email without external services.

### Clinic demo responsibilities

- Fictional clinicians, services, prices and working hours.
- Clinic-specific assistant instructions and tool descriptions.
- English, German and Ukrainian content.
- Marketing page, access flow and booking dashboard.

The landing page is at `/`; the signed-in booking demo is at `/demo`. Provider logos on the landing page illustrate potential integrations, not installed connectors or partnerships.

## Where the code lives

| Responsibility | Current location |
| --- | --- |
| Booking and availability | [`booking.ts`](../src/lib/booking.ts), [`schedule.ts`](../src/lib/schedule.ts) |
| Voice lifecycle and tools | [`live.ts`](../src/lib/live.ts), [`live-events.ts`](../src/lib/live-events.ts), [`tools.ts`](../src/lib/tools.ts) |
| Authentication and storage | [`auth.ts`](../src/lib/auth.ts), [`access-links.ts`](../src/lib/access-links.ts), [`db.ts`](../src/lib/db.ts) |
| Google Calendar integration | [`google-calendar.ts`](../src/lib/google-calendar.ts), [`calendar-sync.ts`](../src/lib/calendar-sync.ts) |
| Email delivery | [`access-mail.ts`](../src/lib/access-mail.ts), [`mail.ts`](../src/lib/mail.ts), [`contact.ts`](../src/lib/contact.ts) |
| Clinic data and assistant instructions | [`clinic.ts`](../src/lib/clinic.ts), [`agent-prompts.ts`](../src/lib/agent-prompts.ts) |
| Interface and routes | [`src/components/`](../src/components/), [`src/app/`](../src/app/) |
| Domain and provider-fixture tests | [`tests/`](../tests/) |

## Development direction

The next architectural step is to separate business-specific catalogs, scheduling policies and assistant instructions from the shared workflows. This should let other example applications use the core without inheriting the dental clinic's assumptions.

Planned integration areas include additional calendar providers, CRM and business software, telephony and WhatsApp. These are development directions, not committed delivery dates or existing connectors. New integrations should preserve confirmation, ownership and retry behavior across channels.

See [configuration and deployment](configuration.md) for setup, credentials, checks and current operational limitations.
