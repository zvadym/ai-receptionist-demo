# Marketing landing and email access

Approved direction: the user requested a bright promotional landing, described capabilities, telephony/WhatsApp/CRM integration possibilities, five relevant vendor logos, persisted requests and Resend access links. The follow-up selects international positioning with Austria first, English default and URL-selected German/Ukrainian (`?l=de`, `?l=uk`). Proceed under this authorization.

## Experience

Use Linden AI as the product label; Linden Dental remains the fictional demo clinic. Cream/teal/lime visual identity, large editorial headings, an illustrative conversation-to-calendar scene, capability sections, channel integration section, locale-specific vendor strip, FAQ and access form. All claims distinguish today's browser demo/local booking workflow/Google calendar overview from prospective telephony, WhatsApp and external CRM integrations. No fabricated metrics, partnerships, testimonials or popularity rankings. Vendor assets retain their real identity and link to official sites.

Root `/` always shows the marketing page; `/demo` requires the existing session. English is the default, `l` chooses `en`, `de`, `uk` (`ua` accepted as an alias), unsupported values fall back to English. Switching language updates URL and visible content. Access email and demo retain the requested locale. Existing booking, voice, limits and calendars remain functional.

## Access

Form collects name, email and optional clinic/company. Persist each accepted request, language, time, send state and provider message ID before sending. Request limits/honeypot remain. A 256-bit random access token is stored only as a SHA-256 hash with a 30-minute expiry; a new request supersedes the previous unconsumed token for the email. Consume atomically once and create the existing HttpOnly session. Email scanners do not consume links: the access page asks the recipient to press Open demo and posts the token. Place the token in a URL fragment, strip it from the visible URL after loading, and apply no-store/no-referrer. No automatic marketing opt-in.

Resend sends localized HTML/text using RESEND_API_KEY and RESEND_FROM, with one idempotency key per saved request. APP_ORIGIN supplies the fixed link origin; never derive it from arbitrary Host headers. Provider errors retain the request with failed status and invalidate that request's token only. Explicit local mail mode remains available for development. API acceptance is stored as sent, not claimed as delivered. Real sender configuration is being requested because the supplied key is send-only.

## Verification

Exercise persistence, expiry, replay, concurrent consumption, supersession, failed sending and locale links using isolated databases/mocked provider. Run existing tests and production build once changes are complete. Browser-check all languages, vendor selection, form states, email-link sign-in, keyboard/mobile layout and existing demo. Use Resend's official test recipient for delivery API checks once sender is known; never send unsolicited real emails.

## Approved extension: telephony providers
The user requested the same provider-list treatment as the existing CRM row. Add a separate five-logo telephony row alongside CRM, reusing existing responsive styles and localized EN/DE/UK headings. Select providers with documented programmable voice or SIP capabilities; link to official product pages and record official logo sources. Describe these as possible custom integrations, without implying active connections or partnerships. No telephony provisioning or backend change.
