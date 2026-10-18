-- =====================================================================
-- Lumen Quiz — bónus de sequência (como no Kahoot)
-- A partir da 2.ª resposta certa seguida: +100 por cada certa seguida, até +500.
-- Errada ou sem resposta põe a sequência a zero. Calculado no servidor quando a
-- pergunta fecha (credit_question_points), por isso nada se revela antes do tempo.
-- =====================================================================

alter table public.players add column if not exists streak int not null default 0;
alter table public.answers add column if not exists streak       int not null default 0;  -- sequência ao responder
alter table public.answers add column if not exists streak_bonus int not null default 0;  -- já incluído em points_awarded

create or replace function public.credit_question_points(p_session_id uuid, p_position int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_question text;
begin
  select question_id into v_question
    from session_questions where session_id = p_session_id and position = p_position;
  if v_question is null then return; end if;

  -- Sequência: certa => +1; errada ou sem resposta => 0
  update players p
     set streak = case
                    when exists (select 1 from answers a
                                  where a.player_id = p.id and a.question_id = v_question and a.is_correct)
                    then p.streak + 1 else 0 end
   where p.session_id = p_session_id;

  -- Bónus entra nos pontos da própria resposta (a revelação mostra o total e o bónus)
  update answers a
     set streak       = p.streak,
         streak_bonus = least(100 * (p.streak - 1), 500),
         points_awarded = a.points_awarded + least(100 * (p.streak - 1), 500)
    from players p
   where a.player_id = p.id and a.session_id = p_session_id and a.question_id = v_question and a.is_correct;

  update players p
     set score = p.score + a.points_awarded
    from answers a
   where a.session_id = p_session_id and a.question_id = v_question and a.player_id = p.id;
end $$;

revoke execute on function public.credit_question_points(uuid, int) from public, anon, authenticated;
