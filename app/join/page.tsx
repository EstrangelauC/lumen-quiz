import SimpleShell from '@/components/SimpleShell';
import PinForm from '@/components/game/PinForm';

// Passo 1: escrever o PIN à mão (quem não usou o link nem o QR code)
export default function JoinPage() {
  return (
    <SimpleShell>
      <PinForm />
    </SimpleShell>
  );
}
