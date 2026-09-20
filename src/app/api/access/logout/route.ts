import { cookies } from 'next/headers';
import { cookieName, revokeToken } from '@/lib/auth';
import { handle, json, sameOrigin } from '@/lib/http';
export async function POST(request: Request) {
  return handle(async () => {
    sameOrigin(request);
    const jar = await cookies();
    const token = jar.get(cookieName)?.value;
    if (token) revokeToken(token);
    jar.delete(cookieName);
    return json({ ok: true });
  });
}
