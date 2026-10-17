-- =====================================================================
-- LUMEN QUIZ — Banco de perguntas (substitui os quizzes feitos à mão)
--
-- Remove o modelo antigo (quizzes/questions/options e o jogo em direto).
-- O jogo é recriado sobre o banco na migração seguinte: players,
-- game_sessions, answers, is_session_member, is_session_host, join_session,
-- next_question, reveal_answer, end_session e respetivas policies.
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
