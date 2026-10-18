import type { SupabaseClient } from '@supabase/supabase-js';

export type HostProfile = { display_name: string; default_time_limit_s: number };

export async function loadProfile(supabase: SupabaseClient, userId: string): Promise<HostProfile> {
  const { data } = await supabase
    .from('profiles')
    .select('display_name, default_time_limit_s')
    .eq('id', userId)
    .maybeSingle();

  return {
    display_name: data?.display_name ?? '',
    default_time_limit_s: data?.default_time_limit_s ?? 20,
  };
}
