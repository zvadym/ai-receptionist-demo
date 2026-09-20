import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Linden Dental · Voice concierge', description: 'A multilingual voice booking demo for a fictional dental clinic.', robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="uk"><body>{children}</body></html>;
}
