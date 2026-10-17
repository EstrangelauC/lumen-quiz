import { redirect } from 'next/navigation';
import HostGame from '@/components/game/HostGame';
import { getRegisteredUser } from '@/lib/supabase/server';

export default async function HostPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const { supabase, user } = await getRegisteredUser();
  if (!user) redirect(`/login?next=/host/${sessionId}`);

  const { data: session } = await supabase
    .from('game_sessions')
    .select('id, pin, host_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session || session.host_id !== user.id) redirect('/dashboard');

  return <HostGame sessionId={session.id} pin={session.pin} />;
}
