import { cookies } from 'next/headers';
import { z } from 'zod';
import { cookieName, verifyCode } from '@/lib/auth';
import { body, handle, json } from '@/lib/http';
export async function POST(request: Request) {
    return handle(async () => {
        const input = z.object({ email: z.email().max(254), code: z.string().regex(/^\d{6}$/) }).parse(await body(request));
        const { user, token } = (await verifyCode(input.email, input.code));
        (await cookies()).set(cookieName, token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 7 * 86400 });
        return json({ user });
    });
}
