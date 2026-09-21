# Landing workflow implementation plan

Goal: Explain how a clinic adopts the assistant and offer direct developer contact.
Architecture: Update existing server-rendered Landing and its en/de/uk copy. Reuse landing CSS and isolate dialog state in DeveloperContact; no new dependencies.

- Update src/lib/landing-copy.ts: remove the language proof item, write four localized onboarding steps and developer-call copy.
- Update src/components/landing.tsx: render remaining proof icons, use the final step index for the checkmark, add a DeveloperContact client component with a native dialog, form and LinkedIn option.
- Update src/app/landing.css: four/two/one-column steps and responsive highlighted CTA.
- Verify TypeScript and inspect desktop/mobile rendering, all three translations, CTA dialog and removal of the old section. Verify contact email delivery with mocked Resend below.

- Add contact-copy.ts translations, contact.ts persistence and Resend delivery, and /api/contact using existing request validation and error handling. Add contact_requests to schema version 3.
- Verify contact validation, fixed recipient and Reply-To, persistence before delivery, retained failures and rate limits using isolated SQLite and mocked Resend. Check dialog keyboard behavior and responsive layout in the browser.
