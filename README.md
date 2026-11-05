# Linden AI

**A multilingual AI receptionist demo for a fictional dental clinic.**

Explore appointment booking by voice or with a calendar: find a time, review the details, and confirm. Built with Next.js, React and TypeScript, with a local PostgreSQL-compatible database so you can try the booking flow without signing up for external services.

[Get started](#get-started) · [Configuration](docs/configuration.md) · [Contributing](#contributing) · [MIT license](LICENSE)

![Linden AI landing page with its receptionist preview and clinic benefits](docs/images/landing.png)

## What you can try

- **Book, reschedule and cancel** appointments, with a separate confirmation before each change.
- **Switch between English, German and Ukrainian**, on both the landing page and the booking dashboard.
- **Explore three fictional clinicians**, each with their own services and availability in the Europe/Vienna time zone.
- **Sign in with a one-time access link**, delivered to a local test inbox during development.
- **Connect optional services** for live voice, email delivery and Google Calendar synchronization.

![Local booking dashboard showing the voice panel, available times and appointment controls](docs/images/booking.png)

*Screenshots use synthetic demo data. Voice and Google Calendar are not connected in this local preview.*

## Get started

You'll need **Node.js 22** and npm.

```sh
git clone https://github.com/zvadym/ai-receptionist-demo.git
cd ai-receptionist-demo
npm ci
cp .env.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000), then:

1. Request demo access using a made-up name and an email such as `demo@example.test`.
2. Open **Open development inbox** on the access form and follow your access link.
3. Press **Open my demo**, choose a service and a time, then confirm your appointment.

No API key is needed for this flow. Emails stay in the local inbox; bookings stay in the ignored `.data/` directory. Leave the Google Calendar settings blank for local-only bookings. The development server listens on loopback only.

For German or Ukrainian, use the language switcher or add `?l=de` / `?l=uk` to the URL.

## Add the services you need

| Capability | Configuration |
| --- | --- |
| Live voice | `OPENAI_API_KEY` with access to the models used by this app. Voice calls incur provider charges. |
| Real access-link emails | `MAIL_MODE=resend`, `RESEND_API_KEY`, a verified `RESEND_FROM` and your `APP_ORIGIN`. |
| Contact-form notifications | `CONTACT_EMAIL` for your own recipient. Optional `LINKEDIN_PROFILE_URL` for your public profile. |
| Google Calendar | Your service-account credentials and a calendar ID for each fictional clinician. |
| Hosted PostgreSQL | `DATABASE_URL`; required on Vercel. Local development uses PGlite automatically. |

See [configuration and deployment](docs/configuration.md) for the complete setup, voice limitations and maintenance commands.

## How it fits together

The landing page lives at `/`; the signed-in experience lives at `/demo`. Web controls and voice tools share the same booking logic, ownership checks and confirmation flow. The server handles credentials, database writes and optional Google Calendar synchronization.

| Area | Where to look |
| --- | --- |
| Pages and API routes | [`src/app/`](src/app/) |
| Interface components | [`src/components/`](src/components/) |
| Booking, authentication and voice tools | [`src/lib/`](src/lib/) |
| Domain and provider-fixture tests | [`tests/`](tests/) |

## Scope of this demo

The clinic, clinicians and sample data are fictional. This is a starting point for experimentation, not a medical service or a production patient system. Use synthetic patient details when trying it.

Browser voice requires compatible OpenAI model access. Phone, WhatsApp and the CRM logos on the landing page illustrate possible custom integrations; those connectors are not included. Automated tests use provider fixtures and do not establish live voice or external-service reliability.

## Contributing

Small fixes, clearer setup instructions and reproducible bug reports are welcome. Keep examples synthetic and credentials out of commits. Before opening a pull request, run:

```sh
npm test
npm run typecheck
npm run build
```

Please describe what changed and how you checked it. Do not include real patient records, access links or private provider logs in issues or screenshots.

## License

Original code and documentation are available under the [MIT license](LICENSE). Third-party logos and dependencies retain their own rights; see [third-party notices](THIRD_PARTY_NOTICES.md).
