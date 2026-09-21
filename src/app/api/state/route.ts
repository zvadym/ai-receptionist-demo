import { handle, json, currentUser } from '@/lib/http';
import { listBookings, pendingProposal, clinicDates } from '@/lib/booking';
import { localMailEnabled } from '@/lib/mail';
export const dynamic = 'force-dynamic';
export async function GET() {
    return handle(async () => {
        const user = await currentUser();
        return json({ user, bookings: user ? (await listBookings(user.id)) : [], proposal: user ? (await pendingProposal(user.id)) : null, dates: clinicDates(), voiceConfigured: Boolean(process.env.OPENAI_API_KEY), localMail: localMailEnabled() });
    });
}
