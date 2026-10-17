import AuthForm from '@/components/AuthForm';
import SimpleShell from '@/components/SimpleShell';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <SimpleShell>
      <AuthForm mode="login" next={next} />
    </SimpleShell>
  );
}
