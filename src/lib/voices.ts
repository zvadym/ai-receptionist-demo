// GPT-Live voices; changing audio.output.voice requires a new session.
export const voiceIds = ['marin', 'gleam', 'willow', 'quartz'] as const;
export type Voice = typeof voiceIds[number];
export const defaultVoice: Voice = 'marin';
