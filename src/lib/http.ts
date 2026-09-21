import { cookies } from 'next/headers';
import { ZodError } from 'zod';
import { cookieName, userForToken } from './auth';
import { AppError } from './errors';
export function sameOrigin(request: Request) {
    const origin = request.headers.get('origin');
    const own = new URL(request.url);
    const allowed = new Set([own.origin, process.env.APP_ORIGIN].filter(Boolean));
    if (process.env.NODE_ENV !== 'production') { allowed.add(`http://127.0.0.1:${own.port}`); allowed.add(`http://localhost:${own.port}`); }
    if (origin && !allowed.has(origin))
        throw new AppError('forbidden', 403);
    if (request.headers.get('sec-fetch-site') === 'cross-site')
        throw new AppError('forbidden', 403);
}
export async function body(request: Request) {
    sameOrigin(request);
    const reader = request.body?.getReader();
    if (!reader)
        throw new AppError('invalid_request');
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
        const { value, done } = await reader.read();
        if (done)
            break;
        size += value.length;
        if (size > 32000) {
            await reader.cancel();
            throw new AppError('invalid_request', 413);
        }
        chunks.push(value);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString());
    }
    catch {
        throw new AppError('invalid_request');
    }
}
export async function currentUser() {
    return (await userForToken((await cookies()).get(cookieName)?.value));
}
export async function requireUser() {
    const user = await currentUser();
    if (!user)
        throw new AppError('unauthorized', 401);
    return user;
}
export function json(value: unknown, status = 200) {
    return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function handle(work: () => Promise<Response> | Response) {
    try {
        return await work();
    }
    catch (error) {
        if (error instanceof AppError)
            return json({ error: error.code }, error.status);
        if (error instanceof ZodError)
            return json({ error: 'invalid_request' }, 400);
        console.error('Request failed:', error instanceof Error ? error.name : 'Unknown error');
        return json({ error: 'internal_error' }, 500);
    }
}
