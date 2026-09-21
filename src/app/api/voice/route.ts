import { z } from 'zod';
import { voiceIds, defaultVoice } from '@/lib/voices';
import { requireUser, body, handle } from '@/lib/http';
import { startVoice } from '@/lib/live';
export const runtime = 'nodejs';
export const maxDuration = 360;
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const input = z.object({ language: z.enum(['uk','de','en']), voice: z.enum(voiceIds).default(defaultVoice), sdp: z.string().min(1).max(30_000) }).parse(await body(request));
    return startVoice(user, input.language, input.sdp, request.signal, input.voice);
  });
}
