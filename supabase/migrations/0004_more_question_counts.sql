-- =====================================================================
-- Lumen Quiz — mais escolhas de número de perguntas por jogo
-- Com o banco maior, o anfitrião escolhe 5, 10, 15, 20, 25, 30, 40 ou 50
-- (antes só 5, 10, 15, 20). O resto de create_session fica igual à 0002.
-- =====================================================================

-- A tabela também limita os números aceites
alter table public.game_sessions drop constraint if exists game_sessions_question_count_check;
alter table public.game_sessions add constraint game_sessions_question_count_check
  check (question_count in (5, 10, 15, 20, 25, 30, 40, 50));

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
  if p_count is null or p_count not in (5, 10, 15, 20, 25, 30, 40, 50) then raise exception 'invalid_count'; end if;
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

revoke execute on function public.create_session(text, int) from public, anon;
grant  execute on function public.create_session(text, int) to authenticated;
