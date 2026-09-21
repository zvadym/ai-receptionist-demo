# Voice controls implementation

1. Update shared prompts with professional address, short responses and spoken confirmation.
2. Add shared supported voices; connect the selector through useVoice and validated route to session creation.
3. Replace automatic proposal modal with a manual-only inline card.
4. Set low reasoning effort, preserving the backend model and tool confirmation guard.
5. Run existing tests and TypeScript; check the browser selector and inline confirmation; run real API smoke with a non-default voice and the low-effort backend using isolated data.
