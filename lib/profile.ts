import type { SupabaseClient } from '@supabase/supabase-js';
import { defaultLocale, isLocale, type Locale } from '@/i18n/config';

export type HostProfile = { display_name: string; default_locale: Locale; default_time_limit_s: number };

export async function loadProfile(supabase: SupabaseClient, userId: string): Promise<HostProfile> {
  const { data } = await supabase
    .from('profiles')
    .select('display_name, default_locale, default_time_limit_s')
    .eq('id', userId)
    .maybeSingle();

  return {
    display_name: data?.display_name ?? '',
    default_locale: isLocale(data?.default_locale) ? data.default_locale : defaultLocale,
    default_time_limit_s: data?.default_time_limit_s ?? 20,
  };
}
