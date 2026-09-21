import { z } from 'zod';
import { body, handle, json, requireUser } from '@/lib/http';
import { changeSchema, prepareChange, confirmChange, dismissProposal } from '@/lib/booking';
import { rateLimit } from '@/lib/auth';
export async function POST(request: Request) {
    return handle(async () => {
        const user = await requireUser();
        (await rateLimit(`bookings:${user.id}`, 60, 60000));
        const input = await body(request);
        if (input.action === 'confirm' || input.action === 'dismiss') {
            const { proposal_id } = z.object({ proposal_id: z.string().uuid() }).parse(input);
            if (input.action === 'dismiss') {
                (await dismissProposal(user.id, proposal_id));
                return json({ dismissed: true });
            }
            return json({ booking: (await confirmChange(user.id, proposal_id)) });
        }
        return json({ proposal: (await prepareChange(user.id, changeSchema.parse(input))) });
    });
}
