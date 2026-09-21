import { requestDeveloperCall } from '@/lib/contact';
import { body, handle, json } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return handle(async () => json(await requestDeveloperCall(await body(request))));
}
