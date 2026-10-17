import { notFound } from 'next/navigation';
import QuizEditor from '@/components/dashboard/QuizEditor';
import { getRegisteredUser } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import type { EditorQuiz } from '@/lib/types';

export default async function EditQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getRegisteredUser();

  const [{ data }, profile] = await Promise.all([
    supabase.rpc('get_quiz_for_edit', { p_id: id }),
    loadProfile(supabase, user!.id),
  ]);
  if (!data) notFound();

  return (
    <QuizEditor
      initial={data as EditorQuiz}
      defaultLocale={profile.default_locale}
      defaultTime={profile.default_time_limit_s}
    />
  );
}
