import { Landing } from '@/components/landing';
import { resolveLanguage } from '@/lib/locale';
import { currentUser } from '@/lib/http';
export default async function Page({ searchParams }: { searchParams: Promise<{ l?: string | string[] }> }) {
  const [query, user] = await Promise.all([searchParams, currentUser()]);
  return <Landing language={resolveLanguage(query.l)} signedIn={!!user}/>;
}
