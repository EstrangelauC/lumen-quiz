import PlayerGame from '@/components/game/PlayerGame';

export default async function PlayPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <PlayerGame sessionId={sessionId} />;
}
