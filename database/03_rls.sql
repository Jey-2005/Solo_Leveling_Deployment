-- ============================================================================
--  SOLO LEVELING SYSTEM  ·  03_rls.sql
--  Every table locked to the owning hunter. Run AFTER 02_functions.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Owner-scoped tables that carry a hunter_id column
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'hunter_stats','xp_ledger','level_events','ai_evaluations',
    'goals','quests','quest_submissions','penalties',
    'workout_sessions','food_favorites','custom_foods','recipes','food_logs',
    'nutrition_targets','body_metrics','body_reports',
    'challenges','challenge_days',
    'transactions','budgets','holdings','savings_goals','sip_entries',
    'options_trades','finance_audits',
    'tasks','skills','skill_sessions','skill_assessments',
    'notifications','push_subscriptions','user_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_all on public.%I', t);
    execute format($f$
      create policy own_all on public.%I
        for all
        using (hunter_id = auth.uid())
        with check (hunter_id = auth.uid())
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. hunters — keyed on `id`, not hunter_id
-- ---------------------------------------------------------------------------
alter table public.hunters enable row level security;
drop policy if exists hunter_select on public.hunters;
drop policy if exists hunter_update on public.hunters;
drop policy if exists hunter_insert on public.hunters;

create policy hunter_select on public.hunters for select using (id = auth.uid());
create policy hunter_update on public.hunters for update using (id = auth.uid()) with check (id = auth.uid());
create policy hunter_insert on public.hunters for insert with check (id = auth.uid());
-- no delete policy: account removal happens via auth.users cascade

-- ---------------------------------------------------------------------------
-- 3. Child tables reached through a parent (no direct hunter_id on the row)
-- ---------------------------------------------------------------------------
alter table public.workout_sets enable row level security;
drop policy if exists sets_own on public.workout_sets;
create policy sets_own on public.workout_sets for all
  using (exists (select 1 from public.workout_sessions s
                 where s.id = session_id and s.hunter_id = auth.uid()))
  with check (exists (select 1 from public.workout_sessions s
                 where s.id = session_id and s.hunter_id = auth.uid()));

alter table public.recipe_ingredients enable row level security;
drop policy if exists ingredients_own on public.recipe_ingredients;
create policy ingredients_own on public.recipe_ingredients for all
  using (exists (select 1 from public.recipes r
                 where r.id = recipe_id and r.hunter_id = auth.uid()))
  with check (exists (select 1 from public.recipes r
                 where r.id = recipe_id and r.hunter_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. Shared read-only reference data
-- ---------------------------------------------------------------------------
alter table public.food_database enable row level security;
drop policy if exists food_read on public.food_database;
create policy food_read on public.food_database for select to authenticated using (true);

alter table public.workout_types enable row level security;
drop policy if exists wt_read on public.workout_types;
create policy wt_read on public.workout_types for select to authenticated using (true);

alter table public.exercises enable row level security;
drop policy if exists ex_read on public.exercises;
create policy ex_read on public.exercises for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 5. Server-only tables — no anon/authenticated access at all.
--    Only the service_role key (used by /api/*) can touch these.
-- ---------------------------------------------------------------------------
alter table public.ai_cache enable row level security;
alter table public.ai_usage enable row level security;
revoke all on public.ai_cache from anon, authenticated;
revoke all on public.ai_usage from anon, authenticated;

-- Let a hunter see their own AI spend (read-only) for the settings screen.
drop policy if exists usage_read_own on public.ai_usage;
create policy usage_read_own on public.ai_usage for select using (hunter_id = auth.uid());
grant select on public.ai_usage to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Views inherit RLS from base tables; make them security_invoker
-- ---------------------------------------------------------------------------
alter view public.v_nutrition_daily  set (security_invoker = on);
alter view public.v_training_daily   set (security_invoker = on);
alter view public.v_finance_monthly  set (security_invoker = on);

grant select on public.v_nutrition_daily, public.v_training_daily,
               public.v_finance_monthly to authenticated;

-- ---------------------------------------------------------------------------
-- 6b. Table privileges
--
-- Supabase normally grants these to `authenticated` via default privileges,
-- but relying on that is fragile: if a project has had its defaults tightened
-- the whole app returns "permission denied". State them explicitly. RLS above
-- is what actually restricts *rows* — these grants only open the door.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  -- Reference data: read-only for everyone signed in.
  foreach t in array array['workout_types','exercises','food_database'] loop
    execute format('grant select on public.%I to authenticated', t);
  end loop;

  -- Owner-scoped tables: full DML, constrained to own rows by RLS.
  foreach t in array array[
    'hunters','hunter_stats','goals','quests','quest_submissions','penalties',
    'level_events','workout_sessions','workout_sets','food_favorites',
    'custom_foods','recipes','recipe_ingredients','food_logs','nutrition_targets',
    'body_metrics','body_reports','challenges','challenge_days','transactions',
    'budgets','holdings','savings_goals','sip_entries','options_trades',
    'finance_audits','tasks','skills','skill_sessions','skill_assessments',
    'notifications','push_subscriptions','user_settings','ai_evaluations'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- xp_ledger is readable (the hunter can audit their own history) but never
-- writable from the browser — XP is minted only by server-side functions.
grant select on public.xp_ledger to authenticated;
revoke insert, update, delete on public.xp_ledger from authenticated;

-- Sequences behind the bigserial tables the client inserts into.
grant usage, select on sequence public.workout_sets_id_seq       to authenticated;
grant usage, select on sequence public.recipe_ingredients_id_seq to authenticated;

-- anon gets nothing beyond signing in.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- 7. Function execution grants
-- ---------------------------------------------------------------------------
grant execute on function public.search_foods(text,int)        to authenticated;
grant execute on function public.get_player_state()            to authenticated;
grant execute on function public.recompute_recipe(uuid)        to authenticated;
grant execute on function public.xp_for_level(int)             to authenticated;
grant execute on function public.level_from_xp(bigint)         to authenticated;
grant execute on function public.rank_for_level(int)           to authenticated;

-- Client-safe write paths (they derive XP server-side; see 02_functions.sql §13)
grant execute on function public.submit_workout(uuid)                          to authenticated;
grant execute on function public.complete_task(uuid, boolean)                  to authenticated;
grant execute on function public.log_practice(uuid,int,text,text,int,date)     to authenticated;

-- Progression writes are server-side only (service_role) so a client can't mint XP.
-- NOTE: Postgres grants EXECUTE to PUBLIC by default, so revoking from the
-- anon/authenticated roles alone is not enough. Revoke from PUBLIC, then
-- hand execution back to service_role only.
do $$
declare f text;
begin
  foreach f in array array[
    'public.award_xp(uuid,stat_key,int,text,uuid,text,int)',
    'public.apply_evaluation(uuid,jsonb,jsonb,numeric,numeric,text)',
    'public.build_telemetry(uuid,int)',
    'public.expire_quests()',
    'public.roll_streaks()',
    'public.score_workout(uuid)',
    'public.recompute_recipe(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant  execute on function %s to service_role', f);
  end loop;
end $$;

-- recompute_recipe is also needed by the owning client after bulk edits
grant execute on function public.recompute_recipe(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Realtime (optional) — live System notifications in the UI
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.level_events;
exception when others then null; end $$;
