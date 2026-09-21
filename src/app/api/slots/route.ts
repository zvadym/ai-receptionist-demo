import { handle, json, requireUser } from '@/lib/http';
import { listSlots } from '@/lib/booking';
export async function GET(request: Request) {
  return handle(async () => {
    await requireUser();
    const search = new URL(request.url).searchParams;
    return json({ slots: listSlots(search.get('service') || '', search.get('date') || '', '', search.get('doctor') || '') });
  });
}
