import { redirect } from 'next/navigation';
import { Demo } from '@/components/demo';
import { currentUser } from '@/lib/http';
import { resolveLanguage } from '@/lib/locale';
export default async function DemoPage({ searchParams }: { searchParams: Promise<{ l?: string | string[] }> }) {
  const [query, user] = await Promise.all([searchParams, currentUser()]);
  const language = resolveLanguage(query.l);
  if (!user) redirect(`/?l=${language}#access`);
  return <Demo initialLanguage={language}/>;
}
