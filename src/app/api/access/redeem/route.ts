import { cookies } from 'next/headers';
import { z } from 'zod';
import { redeemAccess } from '@/lib/access-links';
import { cookieName } from '@/lib/auth';
import { body, handle, json } from '@/lib/http';

export async function POST(request: Request) {
  return handle(async () => {
    const input = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(await body(request));
    const session = redeemAccess(input.token);
    (await cookies()).set(cookieName, session.token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 7 * 86400 });
    return json({ redirect: `/demo?l=${session.language}` });
  });
}
