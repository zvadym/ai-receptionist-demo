import { handle, json, currentUser } from '@/lib/http';
import { listBookings, pendingProposal, clinicDates } from '@/lib/booking';
import { query } from '@/lib/db';
import { localMailEnabled } from '@/lib/mail';
export const dynamic = 'force-dynamic';
export async function GET() {
    return handle(async () => {
        const user = await currentUser();
        const pendingCalendarChanges = user ? (await query("SELECT count(*) AS count FROM calendar_operations WHERE user_id=$1 AND state='pending'", [user.id])).rows[0].count : 0;
        return json({ pendingCalendarChanges, user, bookings: user ? (await listBookings(user.id)) : [], proposal: user ? (await pendingProposal(user.id)) : null, dates: clinicDates(), voiceConfigured: Boolean(process.env.OPENAI_API_KEY), localMail: localMailEnabled() });
    });
}
