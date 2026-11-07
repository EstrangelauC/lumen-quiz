-- Lumen Quiz: preparação de 3 segundos antes de cada pergunta.
-- A hora de início vem do servidor, sem reduzir o temporizador de resposta.
-- Rejeita respostas enviadas por RPC durante a preparação.

-- Anfitrião avança para a próxima pergunta (ou termina o jogo)
create or replace function public.next_question(p_session_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  s      game_sessions%rowtype;
  v_next int;
begin
  select * into s from game_sessions where id = p_session_id and host_id = auth.uid() for update;
  if not found then raise exception 'not_host'; end if;
  if s.status = 'finished' then return; end if;

  -- Saltou a revelação: os pontos da pergunta atual entram agora
  if s.status = 'question' then
    perform public.credit_question_points(p_session_id, s.current_position);
  end if;

  v_next := coalesce(s.current_position, 0) + 1;

  if exists (select 1 from session_questions where session_id = p_session_id and position = v_next) then
    update game_sessions
       set status = 'question', current_position = v_next, question_started_at = now() + interval '3 seconds'
     where id = p_session_id;
  else
    update game_sessions set status = 'finished' where id = p_session_id;
  end if;
end $$;

-- Jogador responde a 'choice' / 'verse': pontuação calculada no SERVIDOR
create or replace function public.submit_answer(p_session_id uuid, p_option_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  s         game_sessions%rowtype;
  sq        session_questions%rowtype;
  q         bank_questions%rowtype;
  pl        players%rowtype;
  v_correct boolean;
  v_elapsed numeric;
  v_points  int;
begin
  select * into pl from players where session_id = p_session_id and user_id = auth.uid();
  if not found then raise exception 'not_player'; end if;

  -- Bloqueia a sessão: a revelação espera que esta resposta termine
  select * into s from game_sessions where id = p_session_id for share;
  if s.status <> 'question' then raise exception 'not_accepting_answers'; end if;

  select * into sq from session_questions where session_id = p_session_id and position = s.current_position;
  select * into q  from bank_questions where id = sq.question_id;
  if q.type not in ('choice', 'verse') then raise exception 'wrong_type'; end if;

  select o.is_correct into v_correct from bank_options o
   where o.id = p_option_id and o.question_id = q.id and o.id = any (sq.display_order);
  if not found then raise exception 'invalid_option'; end if;

  if exists (select 1 from answers where player_id = pl.id and question_id = q.id) then
    raise exception 'already_answered';
  end if;

  v_elapsed := extract(epoch from now() - s.question_started_at);
  if v_elapsed < 0 then raise exception 'question_not_started'; end if;
  if v_elapsed > s.time_limit_s + 1 then raise exception 'time_up'; end if;  -- 1 s de tolerância

  v_points := public.game_points(v_correct, v_elapsed, s.time_limit_s);

  -- O marcador (players.score) só é atualizado em reveal_answer
  insert into answers (session_id, player_id, question_id, option_id, is_correct, points_awarded)
  values (p_session_id, pl.id, q.id, p_option_id, v_correct, v_points)
  on conflict (player_id, question_id) do nothing;
  if not found then raise exception 'already_answered'; end if;
end $$;

-- Jogador responde a 'order': só pontua com a ordem completa certa
create or replace function public.submit_order(p_session_id uuid, p_order uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  s         game_sessions%rowtype;
  sq        session_questions%rowtype;
  q         bank_questions%rowtype;
  pl        players%rowtype;
  v_right   uuid[];
  v_limit   int;
  v_correct boolean;
  v_elapsed numeric;
  v_points  int;
begin
  select * into pl from players where session_id = p_session_id and user_id = auth.uid();
  if not found then raise exception 'not_player'; end if;

  -- Bloqueia a sessão: a revelação espera que esta resposta termine
  select * into s from game_sessions where id = p_session_id for share;
  if s.status <> 'question' then raise exception 'not_accepting_answers'; end if;

  select * into sq from session_questions where session_id = p_session_id and position = s.current_position;
  select * into q  from bank_questions where id = sq.question_id;
  if q.type <> 'order' then raise exception 'wrong_type'; end if;

  select array_agg(o.id order by o.position) into v_right from bank_options o where o.question_id = q.id;

  -- p_order tem de ser uma permutação exata das opções
  if p_order is null
     or array_position(p_order, null) is not null
     or cardinality(p_order) <> cardinality(v_right)
     or (select count(distinct x) from unnest(p_order) x) <> cardinality(v_right)
     or not (p_order <@ v_right) then
    raise exception 'invalid_order';
  end if;

  if exists (select 1 from answers where player_id = pl.id and question_id = q.id) then
    raise exception 'already_answered';
  end if;

  v_limit   := s.time_limit_s + 10;
  v_elapsed := extract(epoch from now() - s.question_started_at);
  if v_elapsed < 0 then raise exception 'question_not_started'; end if;
  if v_elapsed > v_limit + 1 then raise exception 'time_up'; end if;  -- 1 s de tolerância

  v_correct := p_order = v_right;
  v_points  := public.game_points(v_correct, v_elapsed, v_limit);

  -- O marcador (players.score) só é atualizado em reveal_answer
  insert into answers (session_id, player_id, question_id, order_ids, is_correct, points_awarded)
  values (p_session_id, pl.id, q.id, p_order, v_correct, v_points)
  on conflict (player_id, question_id) do nothing;
  if not found then raise exception 'already_answered'; end if;
end $$;
