# Vercel deployment

Deploy the existing demo to the user's Vercel Pro team from the connected GitHub repository. Preserve all three languages, authenticated demos, selected voices and spoken confirmation. Use gpt-live-1 for voice and gpt-5.6-terra with low reasoning for tools.

Persistent PostgreSQL (Neon free, Frankfurt) replaces runtime SQLite. Use async pg queries and one transactional mutation lock shared across instances to preserve slot exclusion, token consumption, tool replay and voice caps. Local development/tests use PGlite with the same PostgreSQL schema. Preserve the old SQLite file and provide an explicit importer for local continuity; production starts clean.

Vercel Fluid Functions run in Frankfurt. WebRTC audio stays browser-to-OpenAI; the streaming voice route owns the outbound sideband and closes sessions at five minutes. A scheduled reconciliation must close provider sessions left behind by an interrupted function. Keep finalization marked incomplete unless provider confirmation was received.

Secrets are environment variables, including inline Google service-account JSON. Email links use the production origin; local mailbox is disabled in production. Google calendars retain their existing read-only availability behavior; booking writes remain in the app database.

Validate PostgreSQL concurrency and auth/domain tests, production build, deployed routes and an authenticated provider/tool smoke. Do not send unsolicited contact emails. Neon terms require the user's personal acceptance; other preparation proceeds independently.
