-- ============================================================================
--  SOLO LEVELING SYSTEM  ·  02_functions.sql
--  Progression engine, search, telemetry.  Run AFTER 01_schema.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. XP CURVE  —  superlinear, so late levels genuinely cost more
-- ---------------------------------------------------------------------------
-- Calibrated so a disciplined hunter averaging ~350-450 XP/day reaches
-- S-rank (L85) in roughly 2.5 years, and Level 100 is a genuine lifetime goal.
-- Early levels are cheap on purpose: the first week should feel explosive.
create or replace function public.xp_for_level(p_level int)
returns bigint language sql immutable as $$
  select greatest(40, floor(40 * power(greatest(p_level,1)::numeric, 1.25)))::bigint;
$$;

-- Cumulative XP required to *reach* p_level from level 1
create or replace function public.xp_cumulative(p_level int)
returns bigint language sql immutable as $$
  select coalesce(sum(public.xp_for_level(g)),0)::bigint
  from generate_series(1, greatest(p_level,1) - 1) g;
$$;

create or replace function public.level_from_xp(p_xp bigint)
returns int language plpgsql immutable as $$
declare lvl int := 1; need bigint; remaining bigint := greatest(p_xp,0);
begin
  loop
    need := public.xp_for_level(lvl);
    exit when remaining < need or lvl >= 200;
    remaining := remaining - need;
    lvl := lvl + 1;
  end loop;
  return lvl;
end $$;

create or replace function public.rank_for_level(p_level int)
returns hunter_rank language sql immutable as $$
  select case
    when p_level >= 100 then 'NATIONAL'::hunter_rank
    when p_level >= 85  then 'S'
    when p_level >= 65  then 'A'
    when p_level >= 45  then 'B'
    when p_level >= 25  then 'C'
    when p_level >= 10  then 'D'
    else 'E' end;
$$;

-- ---------------------------------------------------------------------------
-- 2. AWARD XP  —  the single write path for all progression
--    Applies the AI-set per-stat multiplier and anti-farm daily caps.
-- ---------------------------------------------------------------------------
create or replace function public.award_xp(
  p_hunter   uuid,
  p_stat     stat_key,
  p_base     int,
  p_source   text,
  p_source_id uuid default null,
  p_note     text default null,
  p_daily_cap int default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_mult      numeric := 1.0;
  v_amount    int;
  v_today_src int;
  v_old_level int;
  v_new_level int;
  v_old_rank  hunter_rank;
  v_new_rank  hunter_rank;
  v_stat_val  int;
  v_stat_new  int;
  v_stat_xp   bigint;
begin
  if p_base = 0 then return jsonb_build_object('awarded', 0); end if;

  -- daily cap per (source, stat): diminishing returns beyond the cap
  if p_daily_cap is not null and p_base > 0 then
    select coalesce(sum(amount),0) into v_today_src
    from xp_ledger
    where hunter_id = p_hunter and source = p_source
      and occurred_on = current_date
      and (p_stat is null or stat = p_stat);
    if v_today_src >= p_daily_cap then
      p_base := greatest(1, (p_base * 0.15)::int);      -- 15% trickle past the cap
    elsif v_today_src + p_base > p_daily_cap then
      p_base := (p_daily_cap - v_today_src)
              + greatest(0, ((v_today_src + p_base - p_daily_cap) * 0.15)::int);
    end if;
  end if;

  if p_stat is not null then
    select multiplier into v_mult from hunter_stats
     where hunter_id = p_hunter and stat = p_stat;
    v_mult := coalesce(v_mult, 1.0);
  end if;

  v_amount := round(p_base * case when p_base > 0 then v_mult else 1 end)::int;

  insert into xp_ledger (hunter_id, stat, amount, base_amount, source, source_id, note)
  values (p_hunter, p_stat, v_amount, p_base, p_source, p_source_id, p_note);

  -- stat progression: every 250 stat-XP = +1 point in that attribute
  if p_stat is not null then
    update hunter_stats
       set xp = greatest(0, xp + v_amount), updated_at = now()
     where hunter_id = p_hunter and stat = p_stat
     returning value, xp into v_stat_val, v_stat_xp;

    -- Attribute points follow a square-root curve: fast at first, then each
    -- point costs progressively more. 2k XP -> 20, 20k -> 41, 200k -> 110.
    v_stat_new := least(200, greatest(1, 10 + floor(sqrt(greatest(v_stat_xp,0) / 20.0))::int));
    if v_stat_new <> v_stat_val then
      update hunter_stats set value = v_stat_new
       where hunter_id = p_hunter and stat = p_stat;
    end if;
  end if;

  -- account progression
  select level, rank into v_old_level, v_old_rank from hunters where id = p_hunter;
  update hunters set xp = greatest(0, xp + v_amount) where id = p_hunter;
  select level_from_xp(xp) into v_new_level from hunters where id = p_hunter;
  v_new_rank := rank_for_level(v_new_level);

  if v_new_level <> v_old_level or v_new_rank <> v_old_rank then
    update hunters set level = v_new_level, rank = v_new_rank where id = p_hunter;

    if v_new_level > v_old_level then
      insert into level_events (hunter_id, kind, from_value, to_value, message)
      values (p_hunter,'LEVEL_UP', v_old_level::text, v_new_level::text,
              'You have grown stronger. Level ' || v_new_level || '.');
    elsif v_new_level < v_old_level then
      insert into level_events (hunter_id, kind, from_value, to_value, message)
      values (p_hunter,'DECAY', v_old_level::text, v_new_level::text,
              'Neglect has cost you. Level ' || v_new_level || '.');
    end if;

    if v_new_rank <> v_old_rank then
      insert into level_events (hunter_id, kind, from_value, to_value, message)
      values (p_hunter,
              case when v_new_rank > v_old_rank then 'RANK_UP' else 'RANK_DOWN' end,
              v_old_rank::text, v_new_rank::text,
              'Rank reassessed: ' || v_old_rank || ' -> ' || v_new_rank);
    end if;
  end if;

  return jsonb_build_object(
    'awarded', v_amount, 'base', p_base, 'multiplier', v_mult,
    'level', v_new_level, 'rank', v_new_rank,
    'levelUp', v_new_level > v_old_level, 'rankChanged', v_new_rank <> v_old_rank
  );
end $$;

-- ---------------------------------------------------------------------------
-- 3. NEW HUNTER BOOTSTRAP  —  fires on auth.users insert
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare s stat_key;
begin
  insert into public.hunters (id, display_name, awakened_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    now()
  ) on conflict (id) do nothing;

  foreach s in array enum_range(null::stat_key) loop
    insert into public.hunter_stats (hunter_id, stat) values (new.id, s)
    on conflict do nothing;
  end loop;

  insert into public.nutrition_targets (hunter_id) values (new.id) on conflict do nothing;
  insert into public.user_settings (hunter_id, email) values (new.id, new.email) on conflict do nothing;

  insert into public.level_events (hunter_id, kind, to_value, message)
  values (new.id, 'AWAKENING', 'E',
          'You have acquired the qualification to be a Player. Will you accept?');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4. FOOD SEARCH  —  trigram + prefix, single round trip, ranked
-- ---------------------------------------------------------------------------
create or replace function public.search_foods(p_query text, p_limit int default 30)
returns table (
  source text, id text, name text,
  energy_kcal numeric, carb_g numeric, protein_g numeric, fat_g numeric, fibre_g numeric,
  is_favorite boolean, rank real
)
language sql stable security definer set search_path = public as $$
  -- Scoring ladder, highest wins:
  --   1.00 exact name        0.95 prefix        0.85 substring
  --   else word_similarity() which tolerates typos ('paner' -> 'Paneer ...')
  with q as (select nullif(btrim(lower(unaccent(coalesce(p_query,'')))),'') as t),
  scored as (
    select 'DB'::text as source, f.food_id::text as id, f.food_name as name,
           f.energy_kcal, f.carb_g, f.protein_g, f.fat_g, f.fibre_g,
           exists (select 1 from food_favorites fav
                   where fav.hunter_id = auth.uid() and fav.food_id = f.food_id) as is_favorite,
           (case
              when (select t from q) is null                              then 0.5
              when f.search_text =      (select t from q)                 then 1.00
              when f.search_text like   (select t from q) || '%'          then 0.95
              when f.search_text like '%'||(select t from q)||'%'         then 0.85
              when lower(coalesce(f.food_code,'')) = (select t from q)    then 0.99
              else word_similarity((select t from q), f.search_text)
            end)::real as rank
    from food_database f
    union all
    select 'CUSTOM', c.id::text, c.food_name,
           c.energy_kcal, c.carb_g, c.protein_g, c.fat_g, c.fibre_g, true,
           (case
              when (select t from q) is null                                  then 0.5
              when lower(c.food_name) =    (select t from q)                  then 1.00
              when lower(c.food_name) like (select t from q) || '%'           then 0.95
              when lower(c.food_name) like '%'||(select t from q)||'%'        then 0.85
              else word_similarity((select t from q), lower(c.food_name))
            end)::real
    from custom_foods c where c.hunter_id = auth.uid()
    union all
    select 'RECIPE', r.id::text, r.name,
           r.energy_kcal, r.carb_g, r.protein_g, r.fat_g, r.fibre_g, r.is_favorite,
           (case
              when (select t from q) is null                            then 0.5
              when lower(r.name) =    (select t from q)                 then 1.00
              when lower(r.name) like (select t from q) || '%'          then 0.95
              when lower(r.name) like '%'||(select t from q)||'%'       then 0.85
              else word_similarity((select t from q), lower(r.name))
            end)::real
    from recipes r where r.hunter_id = auth.uid()
  )
  select * from scored
  where rank >= 0.34
    -- With no query the caller is opening the picker, not searching: show only
    -- the hunter's own shortlist (favourites, custom foods, recipes) rather than
    -- an arbitrary slice of the 1,000-dish reference table.
    and ((select t from q) is not null or is_favorite)
  -- the hunter's own recipes and favourites surface above the generic database
  order by is_favorite desc, rank desc, length(name) asc, name asc
  limit greatest(1, least(p_limit, 100));
$$;

-- ---------------------------------------------------------------------------
-- 5. RECIPE MACRO RECOMPUTE  —  always normalised to per-100 g
-- ---------------------------------------------------------------------------
create or replace function public.recompute_recipe(p_recipe uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_yield numeric; v_manual boolean;
  tk numeric; tc numeric; tp numeric; tf numeric; tfb numeric; tg numeric;
begin
  select total_yield_g, manual_macros into v_yield, v_manual from recipes where id = p_recipe;
  if v_manual then return; end if;

  -- IMPORTANT: recipe_ingredients stores each ingredient's *contribution* —
  -- the macros for the gram amount actually used, not per-100g reference
  -- values. This matches food_logs, which also stores scaled absolutes.
  -- Scaling by grams here as well would double-count.
  select coalesce(sum(grams),0),
         coalesce(sum(energy_kcal),0),
         coalesce(sum(carb_g),0),
         coalesce(sum(protein_g),0),
         coalesce(sum(fat_g),0),
         coalesce(sum(fibre_g),0)
    into tg, tk, tc, tp, tf, tfb
  from recipe_ingredients where recipe_id = p_recipe;

  -- if the cook didn't declare a yield, assume sum of ingredient mass
  if coalesce(v_yield,0) <= 0 then v_yield := greatest(tg, 1); end if;

  update recipes set
    energy_kcal = round(tk  * 100.0 / v_yield, 2),
    carb_g      = round(tc  * 100.0 / v_yield, 2),
    protein_g   = round(tp  * 100.0 / v_yield, 2),
    fat_g       = round(tf  * 100.0 / v_yield, 2),
    fibre_g     = round(tfb * 100.0 / v_yield, 2),
    updated_at  = now()
  where id = p_recipe;
end $$;

create or replace function public.trg_recipe_ingredients() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_recipe(coalesce(new.recipe_id, old.recipe_id));
  return coalesce(new, old);
end $$;

drop trigger if exists trg_ing_recompute on public.recipe_ingredients;
create trigger trg_ing_recompute
  after insert or update or delete on public.recipe_ingredients
  for each row execute function public.trg_recipe_ingredients();

-- ---------------------------------------------------------------------------
-- 6. DAILY ROLLUP VIEWS
-- ---------------------------------------------------------------------------
create or replace view public.v_nutrition_daily as
select hunter_id, log_date,
       round(sum(energy_kcal),1) as kcal,
       round(sum(protein_g),1)   as protein_g,
       round(sum(carb_g),1)      as carb_g,
       round(sum(fat_g),1)       as fat_g,
       round(sum(fibre_g),1)     as fibre_g,
       count(*)                  as entries
from public.food_logs group by hunter_id, log_date;

create or replace view public.v_training_daily as
select hunter_id, session_date,
       count(*)                       as sessions,
       round(sum(duration_min),1)     as minutes,
       round(sum(calories),0)         as calories,
       round(sum(total_volume_kg),1)  as volume_kg
from public.workout_sessions group by hunter_id, session_date;

create or replace view public.v_finance_monthly as
select hunter_id, date_trunc('month', txn_date)::date as month,
       sum(amount) filter (where kind='INCOME')  as income,
       sum(amount) filter (where kind='EXPENSE') as spend,
       sum(amount) filter (where kind='EXPENSE' and is_planned=false) as impulse_spend,
       count(*) filter (where kind='EXPENSE')    as expense_count
from public.transactions group by hunter_id, date_trunc('month', txn_date);

-- ---------------------------------------------------------------------------
-- 7. TELEMETRY DIGEST
--    One compact JSON the AI evaluator reads instead of raw rows.
--    This is the core token-efficiency move: ~1.5 KB replaces thousands of rows.
-- ---------------------------------------------------------------------------
create or replace function public.build_telemetry(p_hunter uuid, p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_from date := current_date - (p_days - 1);
  v jsonb;
begin
  select jsonb_strip_nulls(jsonb_build_object(
    'window_days', p_days,
    'hunter', (
      select jsonb_build_object(
        'level', h.level, 'rank', h.rank, 'xp', h.xp,
        'streak', h.streak_days, 'best_streak', h.best_streak,
        'difficulty', h.difficulty_scalar, 'integrity', h.integrity_score,
        'age', case when h.birth_date is null then null
                    else extract(year from age(h.birth_date))::int end,
        'sex', h.sex, 'height_cm', h.height_cm)
      from hunters h where h.id = p_hunter),

    'stats', (
      select jsonb_object_agg(stat, jsonb_build_object('v', value, 'mult', multiplier))
      from hunter_stats where hunter_id = p_hunter),

    'quests', (
      select jsonb_build_object(
        'issued',   count(*),
        'cleared',  count(*) filter (where state='CLEARED'),
        'failed',   count(*) filter (where state in ('FAILED','EXPIRED')),
        'mandatory_missed', count(*) filter (where mandatory and state in ('FAILED','EXPIRED')),
        'clear_rate', case when count(*)=0 then null
                      else round(count(*) filter (where state='CLEARED')::numeric/count(*),3) end,
        'by_stat', (select jsonb_object_agg(stat, n) from (
            select stat, count(*) filter (where state='CLEARED')::int as n
            from quests where hunter_id=p_hunter and quest_date >= v_from group by stat) z))
      from quests where hunter_id = p_hunter and quest_date >= v_from),

    'training', (
      select jsonb_build_object(
        'days_trained', count(distinct session_date),
        'sessions', count(*),
        'minutes', coalesce(round(sum(duration_min))::int,0),
        'volume_kg', coalesce(round(sum(total_volume_kg))::int,0),
        'modalities', (select jsonb_object_agg(type_code, c) from (
            select type_code, count(*)::int c from workout_sessions
            where hunter_id=p_hunter and session_date >= v_from group by type_code) y),
        'gap_days', (select coalesce(max(gap),0) from (
            select session_date - lag(session_date) over (order by session_date) as gap
            from (select distinct session_date from workout_sessions
                  where hunter_id=p_hunter and session_date >= v_from) d) g))
      from workout_sessions where hunter_id = p_hunter and session_date >= v_from),

    'nutrition', (
      select jsonb_build_object(
        'days_logged', count(*),
        'avg_kcal', round(avg(kcal))::int,
        'avg_protein', round(avg(protein_g))::int,
        'avg_fibre', round(avg(fibre_g))::int,
        'kcal_variance_pct', case when avg(kcal) > 0
             then round(100 * stddev_pop(kcal) / avg(kcal))::int else null end,
        'target', (select jsonb_build_object('kcal', kcal, 'protein', protein_g, 'strategy', strategy)
                   from nutrition_targets where hunter_id = p_hunter))
      from v_nutrition_daily where hunter_id = p_hunter and log_date >= v_from),

    'body', (
      select jsonb_build_object(
        'entries', count(*),
        'weight_first', (array_agg(weight_kg order by measured_on))[1],
        'weight_last',  (array_agg(weight_kg order by measured_on desc))[1],
        'bf_last', (array_agg(body_fat_pct order by measured_on desc) filter (where body_fat_pct is not null))[1],
        'avg_sleep', round(avg(sleep_hours),1))
      from body_metrics where hunter_id = p_hunter and measured_on >= v_from),

    'finance', (
      select jsonb_build_object(
        'spend', coalesce(round(sum(amount) filter (where kind='EXPENSE'))::int,0),
        'income', coalesce(round(sum(amount) filter (where kind='INCOME'))::int,0),
        'impulse_ratio', case when coalesce(sum(amount) filter (where kind='EXPENSE'),0) = 0 then null
             else round(coalesce(sum(amount) filter (where kind='EXPENSE' and not is_planned),0)
                        / sum(amount) filter (where kind='EXPENSE'), 3) end,
        'top_categories', (select jsonb_object_agg(category, amt) from (
            select category, round(sum(amount))::int amt from transactions
            where hunter_id=p_hunter and kind='EXPENSE' and txn_date >= v_from
            group by category order by 2 desc limit 5) c),
        'budget_breaches', (
            select count(*) from budgets b
            where b.hunter_id = p_hunter and (
              select coalesce(sum(t.amount),0) from transactions t
              where t.hunter_id=p_hunter and t.kind='EXPENSE' and t.category=b.category
                and t.txn_date >= date_trunc('month', current_date)) > b.monthly_cap))
      from transactions where hunter_id = p_hunter and txn_date >= v_from),

    'tasks', (
      select jsonb_build_object(
        'created', count(*),
        'done', count(*) filter (where completed),
        'overdue_open', count(*) filter (where not completed and due_at < now()),
        'on_time_rate', case when count(*) filter (where completed) = 0 then null
             else round(count(*) filter (where completed and (due_at is null or completed_at <= due_at))::numeric
                        / count(*) filter (where completed), 3) end)
      from tasks where hunter_id = p_hunter and created_at >= v_from),

    'skills', (
      select jsonb_agg(jsonb_build_object(
        'name', s.name, 'level', s.level, 'target', s.target_level,
        'minutes_14d', coalesce((select sum(minutes) from skill_sessions ss
          where ss.skill_id = s.id and ss.session_date >= v_from),0),
        'weekly_target', s.weekly_target_min,
        'last_assessed', s.last_assessed_at))
      from skills s where s.hunter_id = p_hunter and not s.archived),

    'challenge', (
      select jsonb_build_object('title', c.title, 'day', c.current_day, 'total', c.total_days,
             'pass', c.passes, 'partial', c.partials, 'fail', c.fails,
             'streak', c.current_streak, 'lives', c.lives)
      from challenges c where c.hunter_id = p_hunter and c.state = 'ACTIVE' limit 1),

    'xp_by_source', (
      select jsonb_object_agg(source, total) from (
        select source, sum(amount)::int total from xp_ledger
        where hunter_id = p_hunter and occurred_on >= v_from group by source) x),

    'active_days', (
      select count(distinct occurred_on) from xp_ledger
      where hunter_id = p_hunter and occurred_on >= v_from and amount > 0)
  )) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- 8. APPLY AN AI EVALUATION  —  called by the server after Gemini responds
-- ---------------------------------------------------------------------------
create or replace function public.apply_evaluation(
  p_hunter      uuid,
  p_multipliers jsonb,     -- {"STR":1.10,...}
  p_awards      jsonb,     -- {"STR":80,...}  may be negative
  p_difficulty  numeric,
  p_integrity   numeric,
  p_note        text default 'System evaluation'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text; v numeric; total int := 0; res jsonb;
begin
  for k, v in select * from jsonb_each_text(coalesce(p_multipliers,'{}'::jsonb)) loop
    update hunter_stats
       set multiplier = greatest(0.50, least(2.00, v::numeric)), updated_at = now()
     where hunter_id = p_hunter and stat = k::stat_key;
  end loop;

  for k, v in select * from jsonb_each_text(coalesce(p_awards,'{}'::jsonb)) loop
    if v::numeric <> 0 then
      res := public.award_xp(p_hunter, k::stat_key, round(v::numeric)::int,
                             'evaluation', null, p_note, null);
      total := total + coalesce((res->>'awarded')::int, 0);
    end if;
  end loop;

  update hunters set
    difficulty_scalar = coalesce(greatest(0.5, least(3.0, p_difficulty)), difficulty_scalar),
    integrity_score   = coalesce(greatest(0, least(100, p_integrity)), integrity_score),
    last_eval_at      = now()
  where id = p_hunter;

  return jsonb_build_object('total_awarded', total);
end $$;

-- ---------------------------------------------------------------------------
-- 9. EXPIRE STALE QUESTS + APPLY PENALTIES  (run hourly from cron)
-- ---------------------------------------------------------------------------
create or replace function public.expire_quests()
returns int language plpgsql security definer set search_path = public as $$
declare q record; n int := 0;
begin
  for q in
    select * from quests
    where state = 'ACTIVE'
      and ((expires_at is not null and expires_at < now())
        or (expires_at is null and quest_date < current_date))
  loop
    update quests set state = 'EXPIRED' where id = q.id;
    n := n + 1;

    if q.mandatory or q.penalty_xp > 0 then
      insert into penalties (hunter_id, reason, xp_lost, stat, quest_id)
      values (q.hunter_id,
              'Quest expired without submission: ' || q.title,
              greatest(q.penalty_xp, ceil(q.xp_reward * 0.5)::int),
              q.stat, q.id);

      perform public.award_xp(
        q.hunter_id, q.stat,
        -greatest(q.penalty_xp, ceil(q.xp_reward * 0.5)::int),
        'penalty', q.id, 'Expired: ' || q.title, null);

      insert into notifications (hunter_id, channel, title, body, severity, meta)
      values (q.hunter_id, 'IN_APP', 'PENALTY APPLIED',
              q.title || ' was not cleared. XP forfeited.', 'DANGER',
              jsonb_build_object('quest_id', q.id));
    end if;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 10. STREAK MAINTENANCE  (run once daily, before quest generation)
-- ---------------------------------------------------------------------------
create or replace function public.roll_streaks()
returns int language plpgsql security definer set search_path = public as $$
declare h record; n int := 0; had_activity boolean;
begin
  for h in select id, streak_days, best_streak, last_active_date from hunters loop
    select exists (
      select 1 from xp_ledger
      where hunter_id = h.id and occurred_on = current_date - 1 and amount > 0
    ) into had_activity;

    if had_activity then
      update hunters set
        streak_days = streak_days + 1,
        best_streak = greatest(best_streak, streak_days + 1),
        last_active_date = current_date - 1
      where id = h.id;
    elsif h.streak_days > 0 then
      update hunters set streak_days = 0, fatigue = least(100, fatigue + 10) where id = h.id;
      insert into notifications (hunter_id, channel, title, body, severity)
      values (h.id, 'IN_APP', 'STREAK BROKEN',
              'A day passed with no recorded effort. The chain is severed.', 'WARN');
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 11. CONVENIENCE: full player state in one round trip
-- ---------------------------------------------------------------------------
create or replace function public.get_player_state()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); v jsonb; lvl int; cur bigint;
begin
  if uid is null then return null; end if;
  select h.level, h.xp into lvl, cur from hunters h where h.id = uid;
  if lvl is null then return null; end if;

  select jsonb_build_object(
    'hunter', to_jsonb(h) - 'created_at',
    'stats', (select jsonb_object_agg(stat, jsonb_build_object(
                'value', value, 'xp', xp, 'multiplier', multiplier))
              from hunter_stats where hunter_id = uid),
    'progress', jsonb_build_object(
        'level', lvl,
        'xp_into_level', cur - public.xp_cumulative(lvl),
        'xp_for_next', public.xp_for_level(lvl),
        'total_xp', cur),
    'settings', (select to_jsonb(s) from user_settings s where s.hunter_id = uid),
    'targets', (select to_jsonb(t) from nutrition_targets t where t.hunter_id = uid),
    'open_penalties', (select count(*) from penalties where hunter_id = uid and not resolved),
    'unseen_events', (select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb)
                      from (select * from level_events where hunter_id = uid and not seen
                            order by created_at desc limit 10) e),
    'latest_eval', (select to_jsonb(x) from (
        select verdict_title, verdict_body, directive, weakest_stat, created_at
        from ai_evaluations where hunter_id = uid order by created_at desc limit 1) x)
  ) into v
  from hunters h where h.id = uid;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- 12. WORKOUT SESSION -> XP  (deterministic, capped; AI never touches this)
-- ---------------------------------------------------------------------------
create or replace function public.score_workout(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s record; wt record; base int; res jsonb;
begin
  select * into s from workout_sessions where id = p_session;
  if s is null then return jsonb_build_object('error','not found'); end if;
  select * into wt from workout_types where code = s.type_code;

  -- 1 XP per minute, scaled by intensity, +volume bonus for strength work
  base := greatest(5, round(
      coalesce(s.duration_min, 0) * (0.6 + 0.2 * coalesce(s.intensity, 3))
    + coalesce(s.total_volume_kg, 0) / 400.0
  )::int);
  base := least(base, 220);   -- hard ceiling per session

  res := public.award_xp(s.hunter_id, wt.primary_stat, base, 'workout', p_session,
                         wt.name, 320);
  update workout_sessions set xp_awarded = coalesce((res->>'awarded')::int,0) where id = p_session;
  return res;
end $$;

-- ---------------------------------------------------------------------------
-- 13. CLIENT-SAFE WRITE RPCs
--
-- The browser must be able to complete a task, log practice and score a
-- workout. It must NOT be able to choose how much XP that is worth.
--
-- award_xp / score_workout are revoked from authenticated (see 03_rls.sql).
-- These wrappers are the only way in: each one re-reads the authoritative
-- row, derives the reward server-side, and refuses to pay twice.
-- ---------------------------------------------------------------------------

-- Score a workout the caller owns. XP comes from score_workout, not the client.
create or replace function public.submit_workout(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); owner uuid; already int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  select hunter_id, xp_awarded into owner, already
  from workout_sessions where id = p_session;

  if owner is null then raise exception 'session not found' using errcode = 'P0002'; end if;
  if owner <> uid then raise exception 'not your session' using errcode = '42501'; end if;
  if already > 0 then
    return jsonb_build_object('awarded', 0, 'note', 'already scored');
  end if;

  return public.score_workout(p_session);
end $$;

-- Complete a task the caller owns. The reward is the stored xp_reward,
-- clamped, and only ever paid once no matter how often it is toggled.
create or replace function public.complete_task(p_task uuid, p_done boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t record; paid boolean; res jsonb;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  select * into t from tasks where id = p_task;
  if t is null then raise exception 'task not found' using errcode = 'P0002'; end if;
  if t.hunter_id <> uid then raise exception 'not your task' using errcode = '42501'; end if;

  update tasks
     set completed = p_done,
         completed_at = case when p_done then now() else null end,
         updated_at = now()
   where id = p_task;

  if not p_done then
    return jsonb_build_object('awarded', 0, 'completed', false);
  end if;

  -- Has this task ever paid out before?
  select exists (
    select 1 from xp_ledger
     where hunter_id = uid and source = 'task' and source_id = p_task and amount > 0
  ) into paid;

  if paid then
    return jsonb_build_object('awarded', 0, 'completed', true, 'note', 'already rewarded');
  end if;

  res := public.award_xp(uid, t.stat, least(greatest(t.xp_reward, 1), 60),
                         'task', p_task, t.title, 150);
  return res || jsonb_build_object('completed', true);
end $$;

-- Log a practice session against a skill the caller owns.
-- Minutes are clamped and XP is derived here, never supplied by the client.
create or replace function public.log_practice(
  p_skill uuid, p_minutes int, p_focus text default null,
  p_what_built text default null, p_difficulty int default 3,
  p_date date default current_date
) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s record; mins int; sid uuid; res jsonb;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  select * into s from skills where id = p_skill;
  if s is null then raise exception 'skill not found' using errcode = 'P0002'; end if;
  if s.hunter_id <> uid then raise exception 'not your skill' using errcode = '42501'; end if;

  mins := least(greatest(coalesce(p_minutes, 0), 1), 600);   -- 10 hours is the ceiling

  insert into skill_sessions (skill_id, hunter_id, minutes, focus, what_built, difficulty, session_date)
  values (p_skill, uid, mins, p_focus, p_what_built,
          least(greatest(coalesce(p_difficulty,3),1),5), coalesce(p_date, current_date))
  returning id into sid;

  update skills set xp = xp + mins where id = p_skill;

  -- 1 XP per 3 minutes of deliberate practice, capped per day by award_xp.
  res := public.award_xp(uid, 'INT', greatest(1, mins / 3),
                         'practice', p_skill, s.name, 200);
  return res || jsonb_build_object('session_id', sid, 'minutes', mins);
end $$;
