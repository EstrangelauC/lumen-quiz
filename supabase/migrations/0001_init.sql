-- =====================================================================
-- LUMEN QUIZ — Quiz bíblico multilingue em grupo (estilo Kahoot)
-- Migração inicial (substitui fase1_quiz_biblico.sql)
--
-- Antes de aplicar, no painel do Supabase:
--   • Authentication › Sign In / Providers › ativar "Anonymous sign-ins"
--     (os jogadores entram só com PIN, sem conta)
--   • O e-mail + palavra-passe vem ativo por defeito (contas de anfitrião)
--
-- Línguas iniciais: pt, fr, en, es. Para acrescentar outra:
--   insert into public.locales values ('it', 'Italiano');
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LÍNGUAS
-- ---------------------------------------------------------------------
create table public.locales (
  code text primary key,
  name text not null
);

insert into public.locales (code, name) values
  ('pt', 'Português'),
  ('fr', 'Français'),
  ('en', 'English'),
  ('es', 'Español');

-- ---------------------------------------------------------------------
-- 2. PERFIS DOS ANFITRIÕES (contas com e-mail)
-- ---------------------------------------------------------------------
create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  display_name         text check (char_length(display_name) <= 60),
  default_locale       text not null default 'fr' references public.locales(code),
  default_time_limit_s int  not null default 20 check (default_time_limit_s between 5 and 120),
  created_at           timestamptz not null default now()
);

-- Cria o perfil automaticamente quando alguém se regista com e-mail
-- (os jogadores anónimos não precisam de perfil)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.is_anonymous, false) = false then
    insert into public.profiles (id, display_name)
    values (new.id, nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''))
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 3. CONTEÚDO (estrutura neutra + tabelas de tradução)
-- ---------------------------------------------------------------------
create table public.quizzes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid references auth.users(id) on delete cascade,  -- null = quiz oficial
  default_locale text not null default 'fr' references public.locales(code),
  is_public      boolean not null default false,                    -- aparece em "Descobrir"
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index quizzes_owner_idx  on public.quizzes (owner_id);
create index quizzes_public_idx on public.quizzes (is_public) where is_public;

create table public.quiz_translations (
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  locale  text not null references public.locales(code),
  title   text not null,
  primary key (quiz_id, locale)
);

create table public.questions (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null references public.quizzes(id) on delete cascade,
  position     int  not null,                         -- começa em 1
  time_limit_s int  not null default 20 check (time_limit_s between 5 and 120),
  points       int  not null default 1000,
  bible_ref    text,                                  -- ex.: 'João 3:16'
  unique (quiz_id, position)
);

create table public.question_translations (
  question_id uuid not null references public.questions(id) on delete cascade,
  locale      text not null references public.locales(code),
  text        text not null,
  primary key (question_id, locale)
);

create table public.options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  position    int  not null,
  is_correct  boolean not null default false,          -- NUNCA exposto diretamente
  unique (question_id, position)
);

create table public.option_translations (
  option_id uuid not null references public.options(id) on delete cascade,
  locale    text not null references public.locales(code),
  text      text not null,
  primary key (option_id, locale)
);

-- ---------------------------------------------------------------------
-- 4. JOGO EM DIRETO
-- ---------------------------------------------------------------------
create type public.session_status as enum ('lobby', 'question', 'reveal', 'finished');

create table public.game_sessions (
  id                  uuid primary key default gen_random_uuid(),
  quiz_id             uuid not null references public.quizzes(id) on delete cascade,
  host_id             uuid not null default auth.uid(),
  pin                 text not null,
  status              public.session_status not null default 'lobby',
  current_position    int,
  question_started_at timestamptz,
  created_at          timestamptz not null default now()
);

-- O mesmo PIN não pode estar em duas sessões ativas ao mesmo tempo
create unique index game_sessions_active_pin
  on public.game_sessions (pin) where status <> 'finished';

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

create table public.answers (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.game_sessions(id) on delete cascade,
  player_id      uuid not null references public.players(id) on delete cascade,
  question_id    uuid not null references public.questions(id) on delete cascade,
  option_id      uuid not null references public.options(id) on delete cascade,
  is_correct     boolean not null,
  points_awarded int not null,
  answered_at    timestamptz not null default now(),
  unique (player_id, question_id)                    -- uma resposta por pergunta
);
create index answers_session_question_idx on public.answers (session_id, question_id);

-- ---------------------------------------------------------------------
-- 5. FUNÇÕES AUXILIARES DE SEGURANÇA
-- ---------------------------------------------------------------------

-- Conta "a sério" (e-mail), e não um jogador anónimo
create or replace function public.is_registered()
returns boolean
language sql stable as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

create or replace function public.can_view_quiz(p_quiz_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from quizzes
     where id = p_quiz_id and (is_public or owner_id = auth.uid())
  );
$$;

create or replace function public.can_view_option(p_option_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from options o
      join questions q on q.id = o.question_id
     where o.id = p_option_id and public.can_view_quiz(q.quiz_id)
  );
$$;

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

-- ---------------------------------------------------------------------
-- 6. SEGURANÇA (RLS)
-- ---------------------------------------------------------------------
alter table public.locales               enable row level security;
alter table public.profiles              enable row level security;
alter table public.quizzes               enable row level security;
alter table public.quiz_translations     enable row level security;
alter table public.questions             enable row level security;
alter table public.question_translations enable row level security;
alter table public.options               enable row level security;  -- sem policy: inacessível
alter table public.option_translations   enable row level security;
alter table public.game_sessions         enable row level security;
alter table public.players               enable row level security;
alter table public.answers               enable row level security;

create policy "anyone reads locales" on public.locales
  for select to anon, authenticated using (true);

-- Perfil: cada um vê e altera só o seu
create policy "own profile read"   on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid() and public.is_registered());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Quizzes: os meus + os públicos. Escritas via save_quiz(); apagar diretamente.
create policy "read own or public quizzes" on public.quizzes
  for select to authenticated using (is_public or owner_id = auth.uid());
create policy "delete own quizzes" on public.quizzes
  for delete to authenticated using (owner_id = auth.uid());

create policy "read visible quiz tr" on public.quiz_translations
  for select to authenticated using (public.can_view_quiz(quiz_id));
create policy "read visible questions" on public.questions
  for select to authenticated using (public.can_view_quiz(quiz_id));
create policy "read visible q tr" on public.question_translations
  for select to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id));
create policy "read visible opt tr" on public.option_translations
  for select to authenticated using (public.can_view_option(option_id));

-- Sessões, jogadores e respostas: só quem participa
create policy "members read session" on public.game_sessions
  for select to authenticated using (public.is_session_member(id));
create policy "members read players" on public.players
  for select to authenticated using (public.is_session_member(session_id));
create policy "own or host read answers" on public.answers
  for select to authenticated
  using (public.is_session_host(session_id)
         or player_id in (select id from public.players where user_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 7. FUNÇÕES DO EDITOR DE QUIZZES
-- ---------------------------------------------------------------------

-- Cria ou substitui um quiz completo, com todas as traduções.
-- Formato de p:
-- { id?, default_locale, is_public,
--   titles: {pt:"..", fr:".."},
--   questions: [ { time_limit_s, bible_ref, texts:{..},
--                  options:[ {is_correct, texts:{..}} ] } ] }
create or replace function public.save_quiz(p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id      uuid := nullif(p ->> 'id', '')::uuid;
  v_dl      text := p ->> 'default_locale';
  v_public  boolean := coalesce((p ->> 'is_public')::boolean, false);
  v_q       jsonb;
  v_o       jsonb;
  v_qpos    int;
  v_opos    int;
  v_qid     uuid;
  v_oid     uuid;
  v_correct int;
  v_nopts   int;
  v_key     text;
  v_val     text;
begin
  if not public.is_registered() then raise exception 'not_registered'; end if;
  if not exists (select 1 from locales where code = v_dl) then raise exception 'invalid_locale'; end if;
  if coalesce(trim(p -> 'titles' ->> v_dl), '') = '' then raise exception 'missing_title'; end if;
  if jsonb_array_length(coalesce(p -> 'questions', '[]'::jsonb)) = 0 then raise exception 'no_questions'; end if;

  if v_id is null then
    insert into quizzes (owner_id, default_locale, is_public)
    values (auth.uid(), v_dl, v_public)
    returning id into v_id;
  else
    update quizzes
       set default_locale = v_dl, is_public = v_public, updated_at = now()
     where id = v_id and owner_id = auth.uid();
    if not found then raise exception 'not_owner'; end if;
    delete from quiz_translations where quiz_id = v_id;
    delete from questions where quiz_id = v_id;
  end if;

  for v_key, v_val in select key, value from jsonb_each_text(p -> 'titles') loop
    if trim(coalesce(v_val, '')) <> '' and exists (select 1 from locales where code = v_key) then
      insert into quiz_translations (quiz_id, locale, title) values (v_id, v_key, trim(v_val));
    end if;
  end loop;

  for v_q, v_qpos in
    select value, ordinality from jsonb_array_elements(p -> 'questions') with ordinality
  loop
    if coalesce(trim(v_q -> 'texts' ->> v_dl), '') = '' then raise exception 'missing_question_text'; end if;

    v_nopts := jsonb_array_length(coalesce(v_q -> 'options', '[]'::jsonb));
    if v_nopts < 2 or v_nopts > 4 then raise exception 'invalid_option_count'; end if;

    select count(*) into v_correct
      from jsonb_array_elements(v_q -> 'options') as e(val)
     where coalesce((e.val ->> 'is_correct')::boolean, false);
    if v_correct <> 1 then raise exception 'need_one_correct'; end if;

    insert into questions (quiz_id, position, time_limit_s, bible_ref)
    values (v_id, v_qpos, coalesce((v_q ->> 'time_limit_s')::int, 20),
            nullif(trim(coalesce(v_q ->> 'bible_ref', '')), ''))
    returning id into v_qid;

    for v_key, v_val in select key, value from jsonb_each_text(v_q -> 'texts') loop
      if trim(coalesce(v_val, '')) <> '' and exists (select 1 from locales where code = v_key) then
        insert into question_translations (question_id, locale, text) values (v_qid, v_key, trim(v_val));
      end if;
    end loop;

    for v_o, v_opos in
      select value, ordinality from jsonb_array_elements(v_q -> 'options') with ordinality
    loop
      if coalesce(trim(v_o -> 'texts' ->> v_dl), '') = '' then raise exception 'missing_option_text'; end if;

      insert into options (question_id, position, is_correct)
      values (v_qid, v_opos, coalesce((v_o ->> 'is_correct')::boolean, false))
      returning id into v_oid;

      for v_key, v_val in select key, value from jsonb_each_text(v_o -> 'texts') loop
        if trim(coalesce(v_val, '')) <> '' and exists (select 1 from locales where code = v_key) then
          insert into option_translations (option_id, locale, text) values (v_oid, v_key, trim(v_val));
        end if;
      end loop;
    end loop;
  end loop;

  return v_id;
end $$;

-- Devolve um quiz completo (com respostas certas) só ao seu dono
create or replace function public.get_quiz_for_edit(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id',             z.id,
    'default_locale', z.default_locale,
    'is_public',      z.is_public,
    'titles', coalesce(
      (select jsonb_object_agg(qt.locale, qt.title) from quiz_translations qt where qt.quiz_id = z.id),
      '{}'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'time_limit_s', q.time_limit_s,
               'bible_ref',    coalesce(q.bible_ref, ''),
               'texts', coalesce(
                 (select jsonb_object_agg(t.locale, t.text) from question_translations t where t.question_id = q.id),
                 '{}'::jsonb),
               'options', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'is_correct', o.is_correct,
                          'texts', coalesce(
                            (select jsonb_object_agg(ot.locale, ot.text) from option_translations ot where ot.option_id = o.id),
                            '{}'::jsonb)
                        ) order by o.position)
                   from options o where o.question_id = q.id), '[]'::jsonb)
             ) order by q.position)
        from questions q where q.quiz_id = z.id), '[]'::jsonb)
  )
  from quizzes z
  where z.id = p_id and z.owner_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- 8. FUNÇÕES DO JOGO (RPC)
-- ---------------------------------------------------------------------

-- Anfitrião (com conta) cria a sessão e recebe um PIN de 6 dígitos
create or replace function public.create_session(p_quiz_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pin text;
  v_id  uuid;
begin
  if not public.is_registered() then raise exception 'not_registered'; end if;
  if not public.can_view_quiz(p_quiz_id) then raise exception 'quiz_not_found'; end if;

  loop
    v_pin := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (
      select 1 from game_sessions g where g.pin = v_pin and g.status <> 'finished'
    );
  end loop;

  insert into game_sessions (quiz_id, host_id, pin)
  values (p_quiz_id, auth.uid(), v_pin)
  returning id into v_id;

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

  if exists (select 1 from questions where quiz_id = s.quiz_id and position = v_next) then
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

-- Pergunta atual na língua pedida (com fallback para a língua principal do quiz)
create or replace function public.get_current_question(p_session_id uuid, p_locale text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s       game_sessions%rowtype;
  q       questions%rowtype;
  v_dl    text;
  v_total int;
begin
  if not public.is_session_member(p_session_id) then raise exception 'not_member'; end if;

  select * into s from game_sessions where id = p_session_id;
  if s.status not in ('question', 'reveal') then return null; end if;

  select * into q from questions where quiz_id = s.quiz_id and position = s.current_position;
  select default_locale into v_dl from quizzes where id = s.quiz_id;
  select count(*) into v_total from questions where quiz_id = s.quiz_id;

  return jsonb_build_object(
    'question_id',  q.id,
    'position',     q.position,
    'total',        v_total,
    'time_limit_s', q.time_limit_s,
    'started_at',   s.question_started_at,
    'server_now',   now(),
    'status',       s.status,
    'bible_ref',    q.bible_ref,
    'text', coalesce(
      (select t.text from question_translations t where t.question_id = q.id and t.locale = p_locale),
      (select t.text from question_translations t where t.question_id = q.id and t.locale = v_dl)
    ),
    'options', (
      select jsonb_agg(jsonb_build_object(
               'id',       o.id,
               'position', o.position,
               'text', coalesce(
                 (select ot.text from option_translations ot where ot.option_id = o.id and ot.locale = p_locale),
                 (select ot.text from option_translations ot where ot.option_id = o.id and ot.locale = v_dl)
               ),
               -- só é revelado depois de o anfitrião fechar a pergunta
               'is_correct', case when s.status = 'reveal' then o.is_correct end
             ) order by o.position)
        from options o
       where o.question_id = q.id
    )
  );
end $$;

-- Jogador responde: pontuação calculada no SERVIDOR (anti-batota)
create or replace function public.submit_answer(p_session_id uuid, p_option_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  s         game_sessions%rowtype;
  q         questions%rowtype;
  pl        players%rowtype;
  v_correct boolean;
  v_elapsed numeric;
  v_points  int;
begin
  select * into pl from players where session_id = p_session_id and user_id = auth.uid();
  if not found then raise exception 'not_player'; end if;

  select * into s from game_sessions where id = p_session_id;
  if s.status <> 'question' then raise exception 'not_accepting_answers'; end if;

  select * into q from questions where quiz_id = s.quiz_id and position = s.current_position;

  select is_correct into v_correct from options where id = p_option_id and question_id = q.id;
  if not found then raise exception 'invalid_option'; end if;

  if exists (select 1 from answers where player_id = pl.id and question_id = q.id) then
    raise exception 'already_answered';
  end if;

  v_elapsed := extract(epoch from now() - s.question_started_at);
  if v_elapsed > q.time_limit_s + 1 then raise exception 'time_up'; end if;  -- 1 s de tolerância

  -- Estilo Kahoot: resposta imediata = 100 % dos pontos; no último segundo ≈ 50 %
  v_points := case
    when v_correct then round(q.points * (1 - least(v_elapsed / q.time_limit_s, 1) / 2.0))::int
    else 0
  end;

  insert into answers (session_id, player_id, question_id, option_id, is_correct, points_awarded)
  values (p_session_id, pl.id, q.id, p_option_id, v_correct, v_points);

  update players set score = score + v_points where id = pl.id;
end $$;

-- ---------------------------------------------------------------------
-- 9. PERMISSÕES DAS FUNÇÕES
--    Só utilizadores autenticados (inclui jogadores anónimos).
--    As funções de anfitrião verificam is_registered() por dentro.
-- ---------------------------------------------------------------------
revoke execute on function public.save_quiz(jsonb)                 from public, anon;
revoke execute on function public.get_quiz_for_edit(uuid)          from public, anon;
revoke execute on function public.create_session(uuid)             from public, anon;
revoke execute on function public.join_session(text, text, text)   from public, anon;
revoke execute on function public.next_question(uuid)              from public, anon;
revoke execute on function public.reveal_answer(uuid)              from public, anon;
revoke execute on function public.end_session(uuid)                from public, anon;
revoke execute on function public.get_current_question(uuid, text) from public, anon;
revoke execute on function public.submit_answer(uuid, uuid)        from public, anon;
grant  execute on function public.save_quiz(jsonb)                 to authenticated;
grant  execute on function public.get_quiz_for_edit(uuid)          to authenticated;
grant  execute on function public.create_session(uuid)             to authenticated;
grant  execute on function public.join_session(text, text, text)   to authenticated;
grant  execute on function public.next_question(uuid)              to authenticated;
grant  execute on function public.reveal_answer(uuid)              to authenticated;
grant  execute on function public.end_session(uuid)                to authenticated;
grant  execute on function public.get_current_question(uuid, text) to authenticated;
grant  execute on function public.submit_answer(uuid, uuid)        to authenticated;

-- ---------------------------------------------------------------------
-- 10. TEMPO REAL
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.game_sessions;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.answers;

-- ---------------------------------------------------------------------
-- 11. QUIZ OFICIAL DE EXEMPLO (público, aparece em "Descobrir")
-- ---------------------------------------------------------------------
do $$
declare
  v_quiz uuid;
  v_q    uuid;
  v_o    uuid;
begin
  insert into quizzes (owner_id, default_locale, is_public) values (null, 'fr', true) returning id into v_quiz;
  insert into quiz_translations (quiz_id, locale, title) values
    (v_quiz, 'pt', 'Primeiros passos na Bíblia'),
    (v_quiz, 'fr', 'Premiers pas dans la Bible'),
    (v_quiz, 'en', 'First steps in the Bible'),
    (v_quiz, 'es', 'Primeros pasos en la Biblia');

  -- 1
  insert into questions (quiz_id, position, bible_ref) values (v_quiz, 1, 'Génesis 6:14') returning id into v_q;
  insert into question_translations (question_id, locale, text) values
    (v_q, 'pt', 'Quem construiu a arca?'),
    (v_q, 'fr', 'Qui a construit l''arche ?'),
    (v_q, 'en', 'Who built the ark?'),
    (v_q, 'es', '¿Quién construyó el arca?');
  insert into options (question_id, position, is_correct) values (v_q, 1, true) returning id into v_o;
  insert into option_translations values (v_o,'pt','Noé'),(v_o,'fr','Noé'),(v_o,'en','Noah'),(v_o,'es','Noé');
  insert into options (question_id, position) values (v_q, 2) returning id into v_o;
  insert into option_translations values (v_o,'pt','Moisés'),(v_o,'fr','Moïse'),(v_o,'en','Moses'),(v_o,'es','Moisés');
  insert into options (question_id, position) values (v_q, 3) returning id into v_o;
  insert into option_translations values (v_o,'pt','Abraão'),(v_o,'fr','Abraham'),(v_o,'en','Abraham'),(v_o,'es','Abraham');
  insert into options (question_id, position) values (v_q, 4) returning id into v_o;
  insert into option_translations values (v_o,'pt','David'),(v_o,'fr','David'),(v_o,'en','David'),(v_o,'es','David');

  -- 2
  insert into questions (quiz_id, position, bible_ref) values (v_quiz, 2, 'Mateus 2:1') returning id into v_q;
  insert into question_translations (question_id, locale, text) values
    (v_q, 'pt', 'Em que cidade nasceu Jesus?'),
    (v_q, 'fr', 'Dans quelle ville Jésus est-il né ?'),
    (v_q, 'en', 'In which town was Jesus born?'),
    (v_q, 'es', '¿En qué ciudad nació Jesús?');
  insert into options (question_id, position, is_correct) values (v_q, 1, true) returning id into v_o;
  insert into option_translations values (v_o,'pt','Belém'),(v_o,'fr','Bethléem'),(v_o,'en','Bethlehem'),(v_o,'es','Belén');
  insert into options (question_id, position) values (v_q, 2) returning id into v_o;
  insert into option_translations values (v_o,'pt','Nazaré'),(v_o,'fr','Nazareth'),(v_o,'en','Nazareth'),(v_o,'es','Nazaret');
  insert into options (question_id, position) values (v_q, 3) returning id into v_o;
  insert into option_translations values (v_o,'pt','Jerusalém'),(v_o,'fr','Jérusalem'),(v_o,'en','Jerusalem'),(v_o,'es','Jerusalén');
  insert into options (question_id, position) values (v_q, 4) returning id into v_o;
  insert into option_translations values (v_o,'pt','Cafarnaum'),(v_o,'fr','Capharnaüm'),(v_o,'en','Capernaum'),(v_o,'es','Cafarnaúm');

  -- 3
  insert into questions (quiz_id, position, bible_ref) values (v_quiz, 3, 'Mateus 10:2-4') returning id into v_q;
  insert into question_translations (question_id, locale, text) values
    (v_q, 'pt', 'Quantos apóstolos escolheu Jesus?'),
    (v_q, 'fr', 'Combien d''apôtres Jésus a-t-il choisis ?'),
    (v_q, 'en', 'How many apostles did Jesus choose?'),
    (v_q, 'es', '¿Cuántos apóstoles eligió Jesús?');
  insert into options (question_id, position) values (v_q, 1) returning id into v_o;
  insert into option_translations values (v_o,'pt','7'),(v_o,'fr','7'),(v_o,'en','7'),(v_o,'es','7');
  insert into options (question_id, position, is_correct) values (v_q, 2, true) returning id into v_o;
  insert into option_translations values (v_o,'pt','12'),(v_o,'fr','12'),(v_o,'en','12'),(v_o,'es','12');
  insert into options (question_id, position) values (v_q, 3) returning id into v_o;
  insert into option_translations values (v_o,'pt','10'),(v_o,'fr','10'),(v_o,'en','10'),(v_o,'es','10');
  insert into options (question_id, position) values (v_q, 4) returning id into v_o;
  insert into option_translations values (v_o,'pt','40'),(v_o,'fr','40'),(v_o,'en','40'),(v_o,'es','40');

  -- 4 (verdadeiro / falso)
  insert into questions (quiz_id, position, bible_ref) values (v_quiz, 4, 'Daniel 6:16-22') returning id into v_q;
  insert into question_translations (question_id, locale, text) values
    (v_q, 'pt', 'Daniel foi lançado na cova dos leões e saiu ileso.'),
    (v_q, 'fr', 'Daniel a été jeté dans la fosse aux lions et en est sorti indemne.'),
    (v_q, 'en', 'Daniel was thrown into the lions'' den and came out unharmed.'),
    (v_q, 'es', 'Daniel fue echado al foso de los leones y salió ileso.');
  insert into options (question_id, position, is_correct) values (v_q, 1, true) returning id into v_o;
  insert into option_translations values (v_o,'pt','Verdadeiro'),(v_o,'fr','Vrai'),(v_o,'en','True'),(v_o,'es','Verdadero');
  insert into options (question_id, position) values (v_q, 2) returning id into v_o;
  insert into option_translations values (v_o,'pt','Falso'),(v_o,'fr','Faux'),(v_o,'en','False'),(v_o,'es','Falso');
end $$;
