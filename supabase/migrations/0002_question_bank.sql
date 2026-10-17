-- =====================================================================
-- LUMEN QUIZ — Banco de perguntas (substitui os quizzes feitos à mão)
--
-- Remove o modelo antigo (quizzes/questions/options e o jogo em direto)
-- e recria o jogo sobre o banco (secções 6 a 10): game_sessions sorteadas,
-- session_questions, players, answers, policies, Realtime e as RPC do jogo.
--
-- Regra de segurança: o telemóvel nunca recebe is_correct, a ordem certa,
-- o versículo nem a posição guardada antes da revelação. Tudo passa por
-- get_current_question; session_questions não tem policies.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. REMOVER O MODELO ANTIGO
--    As tabelas saem primeiro (levam consigo as policies que usam as
--    funções auxiliares); depois as funções.
-- ---------------------------------------------------------------------
drop table if exists public.answers               cascade;
drop table if exists public.players               cascade;
drop table if exists public.game_sessions         cascade;
drop table if exists public.option_translations   cascade;
drop table if exists public.options               cascade;
drop table if exists public.question_translations cascade;
drop table if exists public.questions             cascade;
drop table if exists public.quiz_translations     cascade;
drop table if exists public.quizzes               cascade;

drop function if exists public.save_quiz(jsonb);
drop function if exists public.get_quiz_for_edit(uuid);
drop function if exists public.create_session(uuid);
drop function if exists public.can_view_quiz(uuid);
drop function if exists public.can_view_option(uuid);
drop function if exists public.get_current_question(uuid, text);
drop function if exists public.submit_answer(uuid, uuid);
drop function if exists public.join_session(text, text, text);
drop function if exists public.next_question(uuid);
drop function if exists public.reveal_answer(uuid);
drop function if exists public.end_session(uuid);
drop function if exists public.is_session_member(uuid);
drop function if exists public.is_session_host(uuid);

drop type if exists public.session_status;

-- ---------------------------------------------------------------------
-- 2. BANCO DE PERGUNTAS
-- ---------------------------------------------------------------------
create type public.q_type  as enum ('choice', 'order', 'verse');
create type public.q_level as enum ('easy', 'medium', 'hard');

create table public.bank_questions (
  id             text primary key,                      -- ex.: 'gen-easy-001'
  type           public.q_type  not null,
  level          public.q_level not null,
  testament      text not null check (testament in ('ot', 'nt')),
  book           text not null,                         -- código do livro, ex.: 'GEN'
  chapter        int  not null,
  verse_start    int  not null,
  verse_end      int  not null,
  active         boolean not null default true,         -- false = reportada, nunca reativada
  reported_count int  not null default 0,
  updated_at     timestamptz not null default now()
);
create index bank_questions_level_idx on public.bank_questions (level, type) where active;

create table public.bank_question_texts (
  question_id text not null references public.bank_questions(id) on delete cascade,
  locale      text not null references public.locales(code),
  prompt      text not null,
  bible_ref   text not null,
  verse_text  text,                                     -- null = só a referência
  primary key (question_id, locale)
);

create table public.bank_options (
  id          uuid primary key default gen_random_uuid(),
  question_id text not null references public.bank_questions(id) on delete cascade,
  position    int  not null,                            -- em 'order', é a ordem certa
  is_correct  boolean not null default false,           -- NUNCA exposto ao telemóvel
  unique (question_id, position)
);

create table public.bank_option_texts (
  option_id uuid not null references public.bank_options(id) on delete cascade,
  locale    text not null references public.locales(code),
  text      text not null,
  ref       text,
  primary key (option_id, locale)
);

-- ---------------------------------------------------------------------
-- 3. SEGURANÇA (RLS): só contas registadas leem o banco
-- ---------------------------------------------------------------------
alter table public.bank_questions      enable row level security;
alter table public.bank_question_texts enable row level security;
alter table public.bank_options        enable row level security;
alter table public.bank_option_texts   enable row level security;

create policy "registered read bank questions" on public.bank_questions
  for select to authenticated using (public.is_registered());
create policy "registered read bank question texts" on public.bank_question_texts
  for select to authenticated using (public.is_registered());
create policy "registered read bank options" on public.bank_options
  for select to authenticated using (public.is_registered());
create policy "registered read bank option texts" on public.bank_option_texts
  for select to authenticated using (public.is_registered());

grant select on public.bank_questions, public.bank_question_texts,
                public.bank_options,   public.bank_option_texts
  to authenticated;

-- ---------------------------------------------------------------------
-- 4. IMPORTAÇÃO
-- ---------------------------------------------------------------------
-- Cria ou atualiza uma pergunta completa. Em conflito preserva
-- active e reported_count (uma pergunta reportada nunca volta a ficar ativa).
-- Formato de p:
-- { id, type, level, testament, book, chapter, verse_start, verse_end,
--   texts:   { pt: { prompt, bible_ref, verse_text } },
--   options: [ { position, is_correct, texts: { pt: { text, ref } } } ] }
create or replace function public.upsert_bank_question(p jsonb)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id  text := nullif(trim(p ->> 'id'), '');
  v_o   jsonb;
  v_oid uuid;
  v_loc text;
  v_t   jsonb;
begin
  if v_id is null then raise exception 'missing_id'; end if;

  insert into bank_questions (id, type, level, testament, book, chapter, verse_start, verse_end)
  values (v_id,
          (p ->> 'type')::q_type, (p ->> 'level')::q_level, p ->> 'testament', p ->> 'book',
          (p ->> 'chapter')::int, (p ->> 'verse_start')::int, (p ->> 'verse_end')::int)
  on conflict (id) do update
     set type = excluded.type, level = excluded.level, testament = excluded.testament,
         book = excluded.book, chapter = excluded.chapter,
         verse_start = excluded.verse_start, verse_end = excluded.verse_end,
         updated_at = now();

  -- Recria textos e opções (as opções levam consigo os respetivos textos)
  delete from bank_question_texts where question_id = v_id;
  delete from bank_options        where question_id = v_id;

  for v_loc, v_t in select key, value from jsonb_each(coalesce(p -> 'texts', '{}'::jsonb)) loop
    insert into bank_question_texts (question_id, locale, prompt, bible_ref, verse_text)
    values (v_id, v_loc, v_t ->> 'prompt', v_t ->> 'bible_ref', nullif(v_t ->> 'verse_text', ''));
  end loop;

  for v_o in select value from jsonb_array_elements(coalesce(p -> 'options', '[]'::jsonb)) loop
    insert into bank_options (question_id, position, is_correct)
    values (v_id, (v_o ->> 'position')::int, coalesce((v_o ->> 'is_correct')::boolean, false))
    returning id into v_oid;

    for v_loc, v_t in select key, value from jsonb_each(coalesce(v_o -> 'texts', '{}'::jsonb)) loop
      insert into bank_option_texts (option_id, locale, text, ref)
      values (v_oid, v_loc, v_t ->> 'text', nullif(v_t ->> 'ref', ''));
    end loop;
  end loop;

  return v_id;
end $$;

-- Contagem de perguntas ativas por nível (para o formulário de novo jogo)
create or replace function public.bank_counts()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_registered() then raise exception 'not_registered'; end if;
  return jsonb_build_object(
    'easy',   (select count(*) from bank_questions where active and level = 'easy'),
    'medium', (select count(*) from bank_questions where active and level = 'medium'),
    'hard',   (select count(*) from bank_questions where active and level = 'hard')
  );
end $$;

-- ---------------------------------------------------------------------
-- 5. PERMISSÕES DAS FUNÇÕES
-- ---------------------------------------------------------------------
revoke execute on function public.upsert_bank_question(jsonb) from public, anon, authenticated;
grant  execute on function public.upsert_bank_question(jsonb) to service_role;

revoke execute on function public.bank_counts() from public, anon;
grant  execute on function public.bank_counts() to authenticated;

-- ---------------------------------------------------------------------
-- 6. JOGO EM DIRETO (sorteado do banco)
-- ---------------------------------------------------------------------
create type public.session_status as enum ('lobby', 'question', 'reveal', 'finished');

create table public.game_sessions (
  id                  uuid primary key default gen_random_uuid(),
  host_id             uuid not null default auth.uid(),
  pin                 text not null,
  status              public.session_status not null default 'lobby',
  level               public.q_level not null,
  question_count      int  not null check (question_count in (5, 10, 15, 20)),
  time_limit_s        int  not null check (time_limit_s between 5 and 120),
  current_position    int,
  question_started_at timestamptz,
  created_at          timestamptz not null default now()
);

-- O mesmo PIN não pode estar em duas sessões ativas ao mesmo tempo
create unique index game_sessions_active_pin
  on public.game_sessions (pin) where status <> 'finished';

-- Perguntas sorteadas de cada sessão. display_order = ordem das opções no ecrã.
-- Sem policies: só as funções security definer leem esta tabela.
create table public.session_questions (
  session_id    uuid not null references public.game_sessions(id) on delete cascade,
  position      int  not null,
  question_id   text not null references public.bank_questions(id) on delete cascade,
  display_order uuid[] not null,
  reported      boolean not null default false,
  primary key (session_id, position)
);

create table public.players (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id    uuid not null default auth.uid(),
  nickname   text not null check (char_length(nickname) between 1 and 20),
  locale     text not null references public.locales(code),   -- língua de CADA jogador
  score      int  not null default 0,
  joined_at  timestamptz not null default now(),
  unique (session_id, user_id),
  unique (session_id, nickname)
);

-- option_id / order_ids sem chave estrangeira: reimportar recria os UUID das opções
create table public.answers (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.game_sessions(id) on delete cascade,
  player_id      uuid not null references public.players(id) on delete cascade,
  question_id    text not null references public.bank_questions(id) on delete cascade,
  option_id      uuid,                                -- choice / verse
  order_ids      uuid[],                              -- order
  is_correct     boolean not null,
  points_awarded int not null,
  answered_at    timestamptz not null default now(),
  unique (player_id, question_id)                    -- uma resposta por pergunta
);
create index answers_session_question_idx on public.answers (session_id, question_id);

-- ---------------------------------------------------------------------
-- 7. SEGURANÇA DO JOGO (RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_session_member(p_session_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from game_sessions where id = p_session_id and host_id = auth.uid())
      or exists (select 1 from players where session_id = p_session_id and user_id = auth.uid());
$$;

create or replace function public.is_session_host(p_session_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from game_sessions where id = p_session_id and host_id = auth.uid());
$$;

alter table public.game_sessions     enable row level security;
alter table public.session_questions enable row level security;  -- sem policy: inacessível
alter table public.players           enable row level security;
alter table public.answers           enable row level security;

create policy "members read session" on public.game_sessions
  for select to authenticated using (public.is_session_member(id));
create policy "members read players" on public.players
  for select to authenticated using (public.is_session_member(session_id));
create policy "own or host read answers" on public.answers
  for select to authenticated
  using (public.is_session_host(session_id)
         or player_id in (select id from public.players where user_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 8. FUNÇÕES DO JOGO (RPC)
-- ---------------------------------------------------------------------

-- Anfitrião (com conta) cria uma sessão com p_count perguntas sorteadas do nível
create or replace function public.create_session(p_level text, p_count int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pin   text;
  v_id    uuid;
  v_level q_level;
  v_time  int;
  v_pos   int := 0;
  q       record;
  v_disp  uuid[];
  v_right uuid[];
begin
  if not public.is_registered() then raise exception 'not_registered'; end if;
  if p_count is null or p_count not in (5, 10, 15, 20) then raise exception 'invalid_count'; end if;
  if p_level is null or p_level not in (select unnest(enum_range(null::q_level))::text) then
    raise exception 'invalid_level';
  end if;
  v_level := p_level::q_level;

  if (select count(*) from bank_questions where active and level = v_level) < p_count then
    raise exception 'not_enough_questions';
  end if;

  select default_time_limit_s into v_time from profiles where id = auth.uid();

  loop
    v_pin := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (
      select 1 from game_sessions g where g.pin = v_pin and g.status <> 'finished'
    );
  end loop;

  insert into game_sessions (host_id, pin, level, question_count, time_limit_s)
  values (auth.uid(), v_pin, v_level, p_count, coalesce(v_time, 20))
  returning id into v_id;

  for q in
    select b.id, b.type from bank_questions b
     where b.active and b.level = v_level
     order by random() limit p_count
  loop
    v_pos := v_pos + 1;
    select array_agg(o.id order by o.position) into v_right from bank_options o where o.question_id = q.id;
    loop
      select array_agg(o.id order by random()) into v_disp from bank_options o where o.question_id = q.id;
      -- Em 'order' a ordem mostrada nunca pode ser a ordem certa
      exit when q.type <> 'order' or coalesce(cardinality(v_right), 0) < 2 or v_disp <> v_right;
    end loop;
    insert into session_questions (session_id, position, question_id, display_order)
    values (v_id, v_pos, q.id, coalesce(v_disp, '{}'));
  end loop;

  return jsonb_build_object('session_id', v_id, 'pin', v_pin);
end $$;

-- Jogador entra com PIN, alcunha e a SUA língua (pode entrar a meio do jogo)
create or replace function public.join_session(p_pin text, p_nickname text, p_locale text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_session uuid;
  v_player  uuid;
  v_nick    text := trim(coalesce(p_nickname, ''));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(v_nick) not between 1 and 20 then raise exception 'invalid_nickname'; end if;
  if not exists (select 1 from locales where code = p_locale) then raise exception 'invalid_locale'; end if;

  select id into v_session from game_sessions where pin = trim(p_pin) and status <> 'finished';
  if not found then raise exception 'session_not_found'; end if;

  -- Já estava no jogo (ex.: recarregou a página)? Atualiza e devolve o mesmo jogador.
  select id into v_player from players where session_id = v_session and user_id = auth.uid();
  if found then
    update players set locale = p_locale where id = v_player;
    return jsonb_build_object('session_id', v_session, 'player_id', v_player);
  end if;

  if exists (select 1 from players where session_id = v_session and lower(nickname) = lower(v_nick)) then
    raise exception 'nickname_taken';
  end if;

  insert into players (session_id, user_id, nickname, locale)
  values (v_session, auth.uid(), v_nick, p_locale)
  returning id into v_player;

  return jsonb_build_object('session_id', v_session, 'player_id', v_player);
end $$;

-- Anfitrião avança para a próxima pergunta (ou termina o jogo)
create or replace function public.next_question(p_session_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  s      game_sessions%rowtype;
  v_next int;
begin
  select * into s from game_sessions where id = p_session_id and host_id = auth.uid();
  if not found then raise exception 'not_host'; end if;
  if s.status = 'finished' then return; end if;

  v_next := coalesce(s.current_position, 0) + 1;

  if exists (select 1 from session_questions where session_id = p_session_id and position = v_next) then
    update game_sessions
       set status = 'question', current_position = v_next, question_started_at = now()
     where id = p_session_id;
  else
    update game_sessions set status = 'finished' where id = p_session_id;
  end if;
end $$;

-- Anfitrião fecha a pergunta e revela a resposta certa
create or replace function public.reveal_answer(p_session_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update game_sessions set status = 'reveal'
   where id = p_session_id and host_id = auth.uid() and status = 'question';
  if not found then raise exception 'cannot_reveal'; end if;
end $$;

-- Anfitrião termina o jogo antes do fim
create or replace function public.end_session(p_session_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update game_sessions set status = 'finished'
   where id = p_session_id and host_id = auth.uid();
  if not found then raise exception 'not_host'; end if;
end $$;

-- Pergunta atual na língua pedida (com recurso a 'pt').
-- Antes da revelação NÃO devolve is_correct, correct_order nem verse_text,
-- e 'position' é a posição de ecrã (1..n), nunca a posição guardada.
create or replace function public.get_current_question(p_session_id uuid, p_locale text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s        game_sessions%rowtype;
  sq       session_questions%rowtype;
  q        bank_questions%rowtype;
  v_reveal boolean;
  v_total  int;
begin
  if not public.is_session_member(p_session_id) then raise exception 'not_member'; end if;

  select * into s from game_sessions where id = p_session_id;
  if s.status not in ('question', 'reveal') then return null; end if;

  select * into sq from session_questions where session_id = p_session_id and position = s.current_position;
  select * into q  from bank_questions where id = sq.question_id;
  select count(*) into v_total from session_questions where session_id = p_session_id;
  v_reveal := s.status = 'reveal';

  return jsonb_build_object(
    'question_id',  q.id,
    'type',         q.type,
    'position',     sq.position,
    'total',        v_total,
    'time_limit_s', s.time_limit_s + case when q.type = 'order' then 10 else 0 end,
    'started_at',   s.question_started_at,
    'server_now',   now(),
    'status',       s.status,
    'bible_ref', coalesce(
      (select t.bible_ref from bank_question_texts t where t.question_id = q.id and t.locale = p_locale),
      (select t.bible_ref from bank_question_texts t where t.question_id = q.id and t.locale = 'pt')
    ),
    'text', coalesce(
      (select t.prompt from bank_question_texts t where t.question_id = q.id and t.locale = p_locale),
      (select t.prompt from bank_question_texts t where t.question_id = q.id and t.locale = 'pt')
    ),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',       o.id,
               'position', d.n,                                  -- posição de ecrã
               'text', coalesce(
                 (select ot.text from bank_option_texts ot where ot.option_id = o.id and ot.locale = p_locale),
                 (select ot.text from bank_option_texts ot where ot.option_id = o.id and ot.locale = 'pt')
               ),
               'ref', case when q.type = 'order' then coalesce(
                 (select ot.ref from bank_option_texts ot where ot.option_id = o.id and ot.locale = p_locale),
                 (select ot.ref from bank_option_texts ot where ot.option_id = o.id and ot.locale = 'pt')
               ) end,
               'is_correct', case when v_reveal and q.type in ('choice', 'verse') then o.is_correct end
             ) order by d.n)
        from unnest(sq.display_order) with ordinality as d(option_id, n)
        join bank_options o on o.id = d.option_id and o.question_id = q.id
    ), '[]'::jsonb),
    'correct_order', case when v_reveal and q.type = 'order' then (
      select to_jsonb(array_agg(o.id order by o.position)) from bank_options o where o.question_id = q.id
    ) end,
    'verse_text', case when v_reveal and q.type in ('choice', 'verse') then coalesce(
      (select t.verse_text from bank_question_texts t where t.question_id = q.id and t.locale = p_locale),
      (select t.verse_text from bank_question_texts t where t.question_id = q.id and t.locale = 'pt')
    ) end,
    'reported', sq.reported
  );
end $$;

-- Pontos estilo Kahoot: resposta imediata = 100 %; no último segundo ≈ 50 %
create or replace function public.game_points(p_correct boolean, p_elapsed numeric, p_limit int)
returns int
language sql immutable set search_path = public as $$
  select case when p_correct
              then round(1000 * (1 - least(p_elapsed / p_limit, 1) / 2.0))::int
              else 0 end;
$$;

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

  select * into s from game_sessions where id = p_session_id;
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
  if v_elapsed > s.time_limit_s + 1 then raise exception 'time_up'; end if;  -- 1 s de tolerância

  v_points := public.game_points(v_correct, v_elapsed, s.time_limit_s);

  insert into answers (session_id, player_id, question_id, option_id, is_correct, points_awarded)
  values (p_session_id, pl.id, q.id, p_option_id, v_correct, v_points);

  update players set score = score + v_points where id = pl.id;
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

  select * into s from game_sessions where id = p_session_id;
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
  if v_elapsed > v_limit + 1 then raise exception 'time_up'; end if;  -- 1 s de tolerância

  v_correct := p_order = v_right;
  v_points  := public.game_points(v_correct, v_elapsed, v_limit);

  insert into answers (session_id, player_id, question_id, order_ids, is_correct, points_awarded)
  values (p_session_id, pl.id, q.id, p_order, v_correct, v_points);

  update players set score = score + v_points where id = pl.id;
end $$;

-- Anfitrião reporta a pergunta revelada: sai do banco (active = false) de vez
create or replace function public.report_question(p_session_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  s     game_sessions%rowtype;
  v_qid text;
begin
  select * into s from game_sessions where id = p_session_id and host_id = auth.uid();
  if not found then raise exception 'not_host'; end if;
  if s.status <> 'reveal' then raise exception 'not_in_reveal'; end if;

  update session_questions set reported = true
   where session_id = p_session_id and position = s.current_position and not reported
  returning question_id into v_qid;

  -- Só na primeira vez nesta sessão
  if v_qid is not null then
    update bank_questions
       set active = false, reported_count = reported_count + 1
     where id = v_qid;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 9. PERMISSÕES DAS FUNÇÕES DO JOGO
--    Só utilizadores autenticados (inclui jogadores anónimos).
--    As funções de anfitrião verificam is_registered() / host_id por dentro.
-- ---------------------------------------------------------------------
revoke execute on function public.create_session(text, int)          from public, anon;
revoke execute on function public.join_session(text, text, text)     from public, anon;
revoke execute on function public.next_question(uuid)                from public, anon;
revoke execute on function public.reveal_answer(uuid)                from public, anon;
revoke execute on function public.end_session(uuid)                  from public, anon;
revoke execute on function public.get_current_question(uuid, text)   from public, anon;
revoke execute on function public.submit_answer(uuid, uuid)          from public, anon;
revoke execute on function public.submit_order(uuid, uuid[])         from public, anon;
revoke execute on function public.report_question(uuid)              from public, anon;
revoke execute on function public.game_points(boolean, numeric, int) from public, anon, authenticated;
grant  execute on function public.create_session(text, int)          to authenticated;
grant  execute on function public.join_session(text, text, text)     to authenticated;
grant  execute on function public.next_question(uuid)                to authenticated;
grant  execute on function public.reveal_answer(uuid)                to authenticated;
grant  execute on function public.end_session(uuid)                  to authenticated;
grant  execute on function public.get_current_question(uuid, text)   to authenticated;
grant  execute on function public.submit_answer(uuid, uuid)          to authenticated;
grant  execute on function public.submit_order(uuid, uuid[])         to authenticated;
grant  execute on function public.report_question(uuid)              to authenticated;

-- ---------------------------------------------------------------------
-- 10. TEMPO REAL
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.game_sessions;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.answers;
