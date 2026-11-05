# Clinic integration section

Replace the existing three-step patient conversation section with four clinic onboarding steps: discovery questionnaire, workflow mapping, system integration and joint testing. Remove the three-language proof item in English, German and Ukrainian; retain language capabilities elsewhere.

Reuse the landing typography and colors. Show four columns on desktop, two on tablet and one on mobile. End the section with a highlighted developer-call CTA opening a native dialog. Offer a contact form (name, email, message) and a LinkedIn profile link supplied through LINKEDIN_PROFILE_URL. Native dialog handles focus trapping, Escape and focus restoration; provide a labeled close button.

Save requests separately in contact_requests before Resend notification to the server-configured `CONTACT_EMAIL`, with the visitor as Reply-To. Preserve failed requests and report notification failure accurately. Reuse existing same-origin request parsing, body limits, rate limits and development mailbox. Add a honeypot and server field validation. Translate all copy to English, German and Ukrainian. No automatic booking or marketing subscription.

Preserve the demo access form and its existing delivery flow. Do not promise integrations are already connected or provide unverified launch dates.
