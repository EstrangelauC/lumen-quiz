import QuizEditor from '@/components/dashboard/QuizEditor';
import { getRegisteredUser } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';

export default async function NewQuizPage() {
  const { supabase, user } = await getRegisteredUser();
  const profile = await loadProfile(supabase, user!.id);
  return <QuizEditor defaultLocale={profile.default_locale} defaultTime={profile.default_time_limit_s} />;
}
