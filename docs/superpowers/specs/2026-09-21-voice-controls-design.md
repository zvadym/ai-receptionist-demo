# Voice refinements

User requested a more professional receptionist, voice selection, no confirmation modal, and a speed review.

Use formal address in Ukrainian and German, concise courteous English, and avoid casual praise. Preserve preference-first booking and a fresh spoken confirmation before each commit.

Offer Marin, Gleam, Willow and Quartz before connecting. Validate the choice on the API boundary; pass it to GPT-Live audio.output.voice. A running session locks the selector because Live requires a new session for a voice change.

Remove the modal. Voice proposals require spoken confirmation. Manual calendar actions show an inline confirmation card only for their own proposal ID; tool-created proposals never open that card. Hide manual confirmation during calls.

Keep gpt-live-1 and the configured gpt-5.6-terra backend. Set backend reasoning effort to low (Terra defaults to medium). This is a latency tuning choice, not a measured performance guarantee. Keep sequential tool execution and existing confirmation safeguards.

References: https://developers.openai.com/api/docs/guides/live-conversations and https://developers.openai.com/api/docs/guides/live-delegation and https://developers.openai.com/api/docs/models/gpt-5.6-terra
