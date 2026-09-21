import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Linden AI · A warm welcome. Every single call.', description: 'Meet the AI receptionist for your clinic. Try voice booking, doctor matching and appointment changes in English, German or Ukrainian.', robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
