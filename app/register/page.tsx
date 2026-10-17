import AuthForm from '@/components/AuthForm';
import SimpleShell from '@/components/SimpleShell';

export default function RegisterPage() {
  return (
    <SimpleShell>
      <AuthForm mode="register" />
    </SimpleShell>
  );
}
