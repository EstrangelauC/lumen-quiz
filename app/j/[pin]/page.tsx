import { redirect } from 'next/navigation';
import SimpleShell from '@/components/SimpleShell';
import JoinForm from '@/components/game/JoinForm';

// Passo 2 (link partilhado / QR code): o PIN já vem no endereço, falta a alcunha e a língua
export default async function JoinWithPinPage({ params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  if (!/^\d{6}$/.test(pin)) redirect('/join');

  return (
    <SimpleShell>
      <JoinForm pin={pin} />
    </SimpleShell>
  );
}
