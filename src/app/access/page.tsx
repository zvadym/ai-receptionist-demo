import { AccessLink } from '@/components/access-link';
import { resolveLanguage } from '@/lib/locale';
import type { Metadata } from 'next';
export const metadata: Metadata = { referrer: 'no-referrer', robots: { index: false, follow: false } };
export default async function AccessPage({ searchParams }: { searchParams: Promise<{ l?: string | string[] }> }) {
  return <AccessLink language={resolveLanguage((await searchParams).l)}/>;
}
