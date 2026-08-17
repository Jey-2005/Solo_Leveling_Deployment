-- ============================================================================
--  SOLO LEVELING SYSTEM  ·  01_schema.sql
--  Full teardown + rebuild.  food_database is PRESERVED (never dropped).
--  Run this whole file in the Supabase SQL editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";       -- fuzzy food search
create extension if not exists "unaccent";      -- accent-insensitive search

-- ---------------------------------------------------------------------------
-- 1. TEARDOWN  —  everything in `public` EXCEPT food_database
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  -- drop every table except the preserved food_database
  for r in (
    select c.relname as tablename
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname <> 'food_database'
      -- never touch tables owned by an installed extension (pg_trgm etc.)
      and not exists (select 1 from pg_depend d
                      where d.objid = c.oid and d.deptype = 'e')
  ) loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;

  -- drop every view
  for r in (select viewname from pg_views where schemaname = 'public') loop
    execute format('drop view if exists public.%I cascade', r.viewname);
  end loop;

  -- drop every function we may have created previously
  for r in (
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d
                      where d.objid = p.oid and d.deptype = 'e')
  ) loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;

  -- drop every custom type
  for r in (
    select t.typname
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype = 'e'
      and not exists (select 1 from pg_depend d
                      where d.objid = t.oid and d.deptype = 'e')
  ) loop
    execute format('drop type if exists public.%I cascade', r.typname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. ENUMS
-- ---------------------------------------------------------------------------
create type hunter_rank      as enum ('E','D','C','B','A','S','NATIONAL');
create type stat_key         as enum ('STR','VIT','AGI','INT','PER','WIL');
create type quest_kind       as enum ('DAILY','WEEKLY','MAIN','URGENT','PENALTY');
create type quest_state      as enum ('ACTIVE','SUBMITTED','CLEARED','FAILED','EXPIRED','ABANDONED');
create type verdict          as enum ('CLEARED','PARTIAL','REJECTED');
create type meal_slot        as enum ('BREAKFAST','LUNCH','DINNER','SNACK');
create type biological_sex   as enum ('MALE','FEMALE');
create type goal_state       as enum ('ACTIVE','ACHIEVED','ABANDONED');
create type challenge_state  as enum ('DRAFT','ACTIVE','COMPLETED','FAILED','ABANDONED');
create type day_verdict      as enum ('PENDING','PASS','PARTIAL','FAIL','SKIPPED');
create type txn_kind         as enum ('EXPENSE','INCOME');
create type notify_channel   as enum ('IN_APP','EMAIL','PUSH');
create type notify_state     as enum ('QUEUED','SENT','FAILED','READ');
create type assessment_state as enum ('IN_PROGRESS','PASSED','FAILED','ABANDONED');

-- ---------------------------------------------------------------------------
-- 3. PRESERVED TABLE — food_database (augment only, never drop)
-- ---------------------------------------------------------------------------
-- Optional convenience columns. Safe if they already exist.
alter table public.food_database add column if not exists category      text;
alter table public.food_database add column if not exists default_grams numeric(8,2) default 100;
alter table public.food_database add column if not exists search_text   text;

-- Denormalised lowercase search column + trigram index = sub-millisecond search
-- Name only. Mixing the food_code in here dilutes trigram scoring badly:
-- word_similarity('paner','paneer butter masala') = 0.67, but appending the
-- code drops whole-string similarity to 0.18. Codes are matched separately.
update public.food_database
   set search_text = lower(unaccent(coalesce(food_name,'')));

create or replace function public.fd_sync_search() returns trigger
language plpgsql as $$
begin
  new.search_text := lower(unaccent(coalesce(new.food_name,'')));
  return new;
end $$;

drop trigger if exists trg_fd_search on public.food_database;
create trigger trg_fd_search before insert or update of food_name, food_code
  on public.food_database for each row execute function public.fd_sync_search();

create index if not exists idx_food_search_trgm on public.food_database using gin (search_text gin_trgm_ops);
create index if not exists idx_food_name        on public.food_database (food_name);

-- ---------------------------------------------------------------------------
-- 4. HUNTER (player) CORE
-- ---------------------------------------------------------------------------
create table public.hunters (
  id                uuid primary key references auth.users(id) on delete cascade,
  handle            text unique,
  display_name      text not null default 'Unnamed Hunter',
  avatar_seed       text default 'shadow',
  title             text default 'The Weakest',

  -- static biometrics (asked once at awakening)
  birth_date        date,
  sex               biological_sex,
  height_cm         numeric(5,1),

  -- progression
  level             int  not null default 1 check (level between 1 and 200),
  xp                bigint not null default 0 check (xp >= 0),
  rank              hunter_rank not null default 'E',
  fatigue           int not null default 0 check (fatigue between 0 and 100),

  -- AI-controlled difficulty knob (the System "tunes" the player)
  difficulty_scalar numeric(4,2) not null default 1.00 check (difficulty_scalar between 0.50 and 3.00),
  integrity_score   numeric(5,2) not null default 100 check (integrity_score between 0 and 100),

  timezone          text not null default 'Asia/Kolkata',
  awakened_at       timestamptz,
  onboarded         boolean not null default false,
  last_eval_at      timestamptz,
  streak_days       int not null default 0,
  best_streak       int not null default 0,
  last_active_date  date,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.hunter_stats (
  hunter_id  uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  stat       stat_key not null,
  value      int  not null default 10 check (value between 1 and 200),
  xp         bigint not null default 0 check (xp >= 0),
  -- AI multiplier applied to future XP in this stat (rewards consistency, punishes cramming)
  multiplier numeric(4,2) not null default 1.00 check (multiplier between 0.50 and 2.00),
  updated_at timestamptz not null default now(),
  primary key (hunter_id, stat)
);

-- Immutable-ish audit of every XP movement. Source of truth for the AI evaluator.
create table public.xp_ledger (
  id          bigserial primary key,
  hunter_id   uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  stat        stat_key,                       -- null = account-level XP only
  amount      int not null,                   -- may be negative (penalties)
  base_amount int not null default 0,         -- pre-multiplier
  source      text not null,                  -- 'workout' | 'quest' | 'penalty' | ...
  source_id   uuid,
  note        text,
  occurred_on date not null default current_date,
  created_at  timestamptz not null default now()
);
create index idx_xp_hunter_date on public.xp_ledger (hunter_id, occurred_on desc);
create index idx_xp_source      on public.xp_ledger (hunter_id, source, occurred_on desc);

create table public.level_events (
  id         bigserial primary key,
  hunter_id  uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  kind       text not null,                   -- 'LEVEL_UP' | 'RANK_UP' | 'RANK_DOWN' | 'DECAY'
  from_value text,
  to_value   text,
  message    text,
  seen       boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_level_events_unseen on public.level_events (hunter_id, seen, created_at desc);

-- The AI's periodic judgement of the hunter. This is what makes levelling non-default.
create table public.ai_evaluations (
  id                bigserial primary key,
  hunter_id         uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  period_start      date not null,
  period_end        date not null,
  telemetry         jsonb not null,           -- the compact digest we sent
  stat_multipliers  jsonb not null,           -- { STR: 1.1, VIT: 0.9, ... }
  difficulty_scalar numeric(4,2) not null,
  integrity_score   numeric(5,2) not null,
  awarded_xp        jsonb,                    -- { STR: 120, ... }
  verdict_title     text,
  verdict_body      text,
  weakest_stat      stat_key,
  directive         text,                     -- the single instruction for tomorrow
  model             text,
  tokens_in         int,
  tokens_out        int,
  created_at        timestamptz not null default now()
);
create index idx_evals_hunter on public.ai_evaluations (hunter_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. GOALS + QUESTS
-- ---------------------------------------------------------------------------
create table public.goals (
  id          uuid primary key default gen_random_uuid(),
  hunter_id   uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  title       text not null,
  detail      text,
  domain      text not null default 'GENERAL',   -- HEALTH|FINANCE|SKILL|TASK|GENERAL
  target_stat stat_key,
  metric_name text,
  metric_start numeric(14,2),
  metric_target numeric(14,2),
  metric_unit text,
  deadline    date,
  state       goal_state not null default 'ACTIVE',
  priority    int not null default 2 check (priority between 1 and 3),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_goals_hunter on public.goals (hunter_id, state, deadline);

create table public.quests (
  id           uuid primary key default gen_random_uuid(),
  hunter_id    uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  goal_id      uuid references public.goals(id) on delete set null,
  kind         quest_kind not null default 'DAILY',
  title        text not null,
  objective    text not null,                 -- what "done" looks like, in System voice
  success_criteria text,                      -- what the AI validates against
  target_value numeric(12,2),
  target_unit  text,
  stat         stat_key not null,
  xp_reward    int not null default 25,
  penalty_xp   int not null default 0,
  difficulty   int not null default 2 check (difficulty between 1 and 5),
  quest_date   date not null default current_date,
  expires_at   timestamptz,
  state        quest_state not null default 'ACTIVE',
  mandatory    boolean not null default false,
  ai_generated boolean not null default true,
  generation_note text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_quests_board on public.quests (hunter_id, quest_date desc, state);
create index idx_quests_open  on public.quests (hunter_id, state) where state = 'ACTIVE';

create table public.quest_submissions (
  id          uuid primary key default gen_random_uuid(),
  quest_id    uuid not null references public.quests(id) on delete cascade,
  hunter_id   uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  proof_text  text,
  proof_value numeric(12,2),
  proof_meta  jsonb,
  verdict     verdict,
  score       int check (score between 0 and 100),
  ai_response text,
  ai_followup text,                            -- the System's next demand
  xp_awarded  int not null default 0,
  model       text,
  created_at  timestamptz not null default now()
);
create index idx_submissions_hunter on public.quest_submissions (hunter_id, created_at desc);

create table public.penalties (
  id         uuid primary key default gen_random_uuid(),
  hunter_id  uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  reason     text not null,
  xp_lost    int not null default 0,
  stat       stat_key,
  quest_id   uuid references public.quests(id) on delete set null,
  expires_at timestamptz,
  resolved   boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_penalties_open on public.penalties (hunter_id, resolved, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. HEALTH — WORKOUTS
-- ---------------------------------------------------------------------------
-- Reference table of workout modalities. Seeded in 04_seed.sql.
create table public.workout_types (
  code         text primary key,              -- 'WEIGHT_TRAINING'
  name         text not null,
  category     text not null,                 -- STRENGTH|ENDURANCE|MIXED|MIND_BODY|SPORT|RECOVERY
  icon         text,
  met_base     numeric(4,2) not null,         -- MET at moderate effort
  met_low      numeric(4,2),
  met_high     numeric(4,2),
  primary_stat stat_key not null,
  -- Declarative field schema drives the dynamic logging form on the client
  fields       jsonb not null default '[]'::jsonb,
  popularity   int not null default 50,       -- ordering hint (global reach)
  blurb        text,
  active       boolean not null default true
);

create table public.exercises (
  id           bigserial primary key,
  name         text not null,
  muscle_group text not null,
  equipment    text,
  is_compound  boolean not null default false,
  unique (name, muscle_group)
);
create index idx_exercises_group on public.exercises (muscle_group);

create table public.workout_sessions (
  id            uuid primary key default gen_random_uuid(),
  hunter_id     uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  type_code     text not null references public.workout_types(code),
  session_date  date not null default current_date,
  started_at    timestamptz,
  duration_min  numeric(6,1),
  intensity     int check (intensity between 1 and 5),
  rpe           int check (rpe between 1 and 10),
  calories      numeric(8,1),
  -- modality-specific values, validated client-side against workout_types.fields
  metrics       jsonb not null default '{}'::jsonb,
  notes         text,
  total_volume_kg numeric(12,2) default 0,     -- computed for strength sessions
  xp_awarded    int not null default 0,
  created_at    timestamptz not null default now()
);
create index idx_sessions_hunter on public.workout_sessions (hunter_id, session_date desc);

create table public.workout_sets (
  id          bigserial primary key,
  session_id  uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id bigint references public.exercises(id) on delete set null,
  exercise_name text not null,
  set_index   int not null default 1,
  reps        int,
  weight_kg   numeric(7,2),
  distance_m  numeric(9,2),
  seconds     int,
  is_warmup   boolean not null default false,
  rpe         int check (rpe between 1 and 10)
);
create index idx_sets_session on public.workout_sets (session_id, set_index);

-- ---------------------------------------------------------------------------
-- 7. HEALTH — NUTRITION
-- ---------------------------------------------------------------------------
create table public.food_favorites (
  hunter_id  uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  food_id    bigint not null,
  created_at timestamptz not null default now(),
  primary key (hunter_id, food_id)
);

-- Custom foods the hunter defines themselves (per 100 g, same shape as food_database)
create table public.custom_foods (
  id          uuid primary key default gen_random_uuid(),
  hunter_id   uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  food_name   text not null,
  energy_kcal numeric(8,2) not null default 0,
  carb_g      numeric(8,2) not null default 0,
  protein_g   numeric(8,2) not null default 0,
  fat_g       numeric(8,2) not null default 0,
  fibre_g     numeric(8,2) not null default 0,
  created_at  timestamptz not null default now()
);
create index idx_custom_foods_hunter on public.custom_foods (hunter_id, food_name);

-- Recipes: user-composed dishes. Macros always normalised to per-100 g.
create table public.recipes (
  id             uuid primary key default gen_random_uuid(),
  hunter_id      uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  name           text not null,
  description    text,
  total_yield_g  numeric(9,2) not null default 100 check (total_yield_g > 0),
  -- cached per-100g macros, refreshed by trigger whenever ingredients change
  energy_kcal    numeric(8,2) not null default 0,
  carb_g         numeric(8,2) not null default 0,
  protein_g      numeric(8,2) not null default 0,
  fat_g          numeric(8,2) not null default 0,
  fibre_g        numeric(8,2) not null default 0,
  -- when true the cached values are hand-entered and NOT recomputed from ingredients
  manual_macros  boolean not null default false,
  is_favorite    boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_recipes_hunter on public.recipes (hunter_id, name);

-- NOTE: the macro columns below hold each ingredient's CONTRIBUTION for the
-- `grams` used (not per-100g reference values). recompute_recipe sums them
-- and divides by total_yield_g to get the recipe's per-100g figures.
create table public.recipe_ingredients (
  id             bigserial primary key,
  recipe_id      uuid not null references public.recipes(id) on delete cascade,
  food_id        bigint,                                   -- -> food_database
  custom_food_id uuid references public.custom_foods(id) on delete set null,
  label          text not null,
  grams          numeric(9,2) not null check (grams > 0),
  -- macro snapshot per 100 g at time of add (keeps recipe stable if source changes)
  energy_kcal    numeric(8,2) not null default 0,
  carb_g         numeric(8,2) not null default 0,
  protein_g      numeric(8,2) not null default 0,
  fat_g          numeric(8,2) not null default 0,
  fibre_g        numeric(8,2) not null default 0,
  sort_order     int not null default 0
);
create index idx_ingredients_recipe on public.recipe_ingredients (recipe_id, sort_order);

create table public.food_logs (
  id             uuid primary key default gen_random_uuid(),
  hunter_id      uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  log_date       date not null default current_date,
  slot           meal_slot not null default 'SNACK',
  -- exactly one source
  food_id        bigint,
  custom_food_id uuid references public.custom_foods(id) on delete set null,
  recipe_id      uuid references public.recipes(id) on delete set null,
  label          text not null,
  grams          numeric(9,2) not null default 100 check (grams > 0),
  -- resolved absolute macros for THIS entry (grams already applied)
  energy_kcal    numeric(9,2) not null default 0,
  carb_g         numeric(8,2) not null default 0,
  protein_g      numeric(8,2) not null default 0,
  fat_g          numeric(8,2) not null default 0,
  fibre_g        numeric(8,2) not null default 0,
  logged_at      timestamptz not null default now(),
  constraint one_source check (
    (food_id is not null)::int + (custom_food_id is not null)::int + (recipe_id is not null)::int <= 1
  )
);
create index idx_foodlogs_day on public.food_logs (hunter_id, log_date desc, slot);

create table public.nutrition_targets (
  hunter_id     uuid primary key default auth.uid() references public.hunters(id) on delete cascade,
  kcal          numeric(8,1) not null default 2200,
  protein_g     numeric(7,1) not null default 140,
  carb_g        numeric(7,1) not null default 240,
  fat_g         numeric(7,1) not null default 70,
  fibre_g       numeric(7,1) not null default 30,
  water_ml      numeric(8,1) not null default 3000,
  strategy      text not null default 'MAINTAIN',   -- CUT|MAINTAIN|BULK|RECOMP|CUSTOM
  auto_from_report boolean not null default true,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 8. HEALTH — BODY COMPOSITION
-- ---------------------------------------------------------------------------
create table public.body_metrics (
  id          uuid primary key default gen_random_uuid(),
  hunter_id   uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  measured_on date not null default current_date,
  weight_kg   numeric(6,2),
  body_fat_pct numeric(5,2) check (body_fat_pct between 1 and 70),
  neck_cm     numeric(5,1),
  waist_cm    numeric(5,1),
  hip_cm      numeric(5,1),
  chest_cm    numeric(5,1),
  arm_cm      numeric(5,1),
  thigh_cm    numeric(5,1),
  resting_hr  int,
  sleep_hours numeric(4,1),
  note        text,
  created_at  timestamptz not null default now(),
  unique (hunter_id, measured_on)
);
create index idx_body_hunter on public.body_metrics (hunter_id, measured_on desc);

create table public.body_reports (
  id          uuid primary key default gen_random_uuid(),
  hunter_id   uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  generated_on date not null default current_date,
  inputs      jsonb not null,      -- exact inputs used
  computed    jsonb not null,      -- every derived metric
  ai_summary  text,
  ai_actions  jsonb,               -- ["...", "..."]
  created_at  timestamptz not null default now()
);
create index idx_reports_hunter on public.body_reports (hunter_id, generated_on desc);

-- ---------------------------------------------------------------------------
-- 9. CHALLENGES (AI-designed, AI-validated)
-- ---------------------------------------------------------------------------
create table public.challenges (
  id            uuid primary key default gen_random_uuid(),
  hunter_id     uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  title         text not null,
  premise       text,                        -- user's own words
  charter       jsonb not null default '{}'::jsonb,  -- AI-authored: rules[], phases[], win/fail conditions
  total_days    int not null default 100 check (total_days between 3 and 365),
  start_date    date not null default current_date,
  state         challenge_state not null default 'DRAFT',
  strictness    int not null default 3 check (strictness between 1 and 5),
  current_day   int not null default 0,
  passes        int not null default 0,
  partials      int not null default 0,
  fails         int not null default 0,
  longest_streak int not null default 0,
  current_streak int not null default 0,
  lives         int not null default 3,       -- fails allowed before the run breaks
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_challenges_hunter on public.challenges (hunter_id, state);

create table public.challenge_days (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  hunter_id    uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  day_index    int not null,
  day_date     date not null,
  -- the AI writes a fresh brief each day; it escalates with phase + performance
  brief        text,
  requirements jsonb not null default '[]'::jsonb,
  report_text  text,
  report_meta  jsonb,
  verdict      day_verdict not null default 'PENDING',
  score        int check (score between 0 and 100),
  ai_response  text,
  xp_awarded   int not null default 0,
  submitted_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (challenge_id, day_index)
);
create index idx_challenge_days on public.challenge_days (challenge_id, day_index);

-- ---------------------------------------------------------------------------
-- 10. FINANCE
-- ---------------------------------------------------------------------------
create table public.transactions (
  id         uuid primary key default gen_random_uuid(),
  hunter_id  uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  kind       txn_kind not null default 'EXPENSE',
  amount     numeric(14,2) not null check (amount >= 0),
  category   text not null default 'Other',
  merchant   text,
  note       text,
  txn_date   date not null default current_date,
  is_planned boolean not null default false,   -- planned vs impulse (feeds PER stat)
  created_at timestamptz not null default now()
);
create index idx_txn_hunter on public.transactions (hunter_id, txn_date desc);
create index idx_txn_cat    on public.transactions (hunter_id, category, txn_date desc);

create table public.budgets (
  id          uuid primary key default gen_random_uuid(),
  hunter_id   uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  category    text not null,
  monthly_cap numeric(14,2) not null check (monthly_cap >= 0),
  created_at  timestamptz not null default now(),
  unique (hunter_id, category)
);

create table public.holdings (
  id             uuid primary key default gen_random_uuid(),
  hunter_id      uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  symbol         text not null,
  name           text,
  asset_class    text not null default 'EQUITY',  -- EQUITY|MF|ETF|GOLD|CRYPTO|BOND|CASH
  quantity       numeric(16,4) not null default 0,
  avg_cost       numeric(14,4) not null default 0,
  last_price     numeric(14,4),
  price_updated_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_holdings_hunter on public.holdings (hunter_id, symbol);

create table public.savings_goals (
  id            uuid primary key default gen_random_uuid(),
  hunter_id     uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  name          text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  saved_amount  numeric(14,2) not null default 0,
  target_date   date,
  created_at    timestamptz not null default now()
);

create table public.sip_entries (
  id              uuid primary key default gen_random_uuid(),
  hunter_id       uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  fund_name       text not null,
  amount          numeric(14,2) not null check (amount > 0),
  units           numeric(16,4),
  nav             numeric(14,4),
  investment_date date not null default current_date,
  created_at      timestamptz not null default now()
);
create index idx_sip_hunter on public.sip_entries (hunter_id, investment_date desc);

create table public.options_trades (
  id           uuid primary key default gen_random_uuid(),
  hunter_id    uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  underlying   text not null,
  strike       numeric(12,2),
  option_type  text check (option_type in ('CE','PE')),
  side         text not null default 'BUY' check (side in ('BUY','SELL')),
  lots         int not null default 1,
  qty_per_lot  int not null default 1,
  entry_price  numeric(12,2) not null,
  exit_price   numeric(12,2),
  trade_date   date not null default current_date,
  exit_date    date,
  pnl          numeric(14,2),
  thesis       text,
  followed_plan boolean,                       -- discipline flag -> PER stat
  created_at   timestamptz not null default now()
);
create index idx_options_hunter on public.options_trades (hunter_id, trade_date desc);

create table public.finance_audits (
  id            uuid primary key default gen_random_uuid(),
  hunter_id     uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  metrics       jsonb not null,
  discipline_score int check (discipline_score between 0 and 100),
  verdict       text,
  leaks         jsonb,
  directives    jsonb,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 11. TASKS
-- ---------------------------------------------------------------------------
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  hunter_id    uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  goal_id      uuid references public.goals(id) on delete set null,
  title        text not null,
  detail       text,
  category     text default 'General',
  priority     int not null default 2 check (priority between 1 and 3),
  estimate_min int,
  due_at       timestamptz,
  completed_at timestamptz,
  completed    boolean not null default false,
  recurrence   text,                          -- null | DAILY | WEEKDAYS | WEEKLY | MONTHLY
  stat         stat_key not null default 'WIL',
  xp_reward    int not null default 10,
  remind_email boolean not null default false,
  remind_push  boolean not null default true,
  remind_before_min int not null default 30,
  reminded_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_tasks_board on public.tasks (hunter_id, completed, due_at);
create index idx_tasks_due   on public.tasks (due_at) where completed = false;

-- ---------------------------------------------------------------------------
-- 12. SKILLS
-- ---------------------------------------------------------------------------
create table public.skills (
  id            uuid primary key default gen_random_uuid(),
  hunter_id     uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  name          text not null,
  domain        text default 'General',
  description   text,
  level         int not null default 1 check (level between 1 and 10),
  xp            int not null default 0,
  target_level  int not null default 5 check (target_level between 1 and 10),
  weekly_target_min int not null default 180,
  color         text default '#3EC6FF',
  archived      boolean not null default false,
  last_assessed_at timestamptz,
  next_eligible_at timestamptz,               -- cooldown after a failed assessment
  created_at    timestamptz not null default now(),
  unique (hunter_id, name)
);

create table public.skill_sessions (
  id         uuid primary key default gen_random_uuid(),
  skill_id   uuid not null references public.skills(id) on delete cascade,
  hunter_id  uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  minutes    int not null check (minutes > 0),
  focus      text,
  what_built text,
  difficulty int check (difficulty between 1 and 5),
  session_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index idx_skill_sessions on public.skill_sessions (skill_id, session_date desc);

create table public.skill_assessments (
  id            uuid primary key default gen_random_uuid(),
  skill_id      uuid not null references public.skills(id) on delete cascade,
  hunter_id     uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  target_level  int not null,
  questions     jsonb not null,               -- [{id,type,prompt,options?,weight}]
  answers       jsonb,                        -- {qid: answer}
  practice_snapshot jsonb,                    -- logged practice the grader cross-checks
  score         int check (score between 0 and 100),
  pass_mark     int not null default 75,
  state         assessment_state not null default 'IN_PROGRESS',
  per_question  jsonb,                        -- [{id, awarded, max, critique}]
  examiner_notes text,
  integrity_flag text,                        -- set when claims contradict logs
  started_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index idx_assessments_skill on public.skill_assessments (skill_id, started_at desc);

-- ---------------------------------------------------------------------------
-- 13. SYSTEM / INFRA
-- ---------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  hunter_id  uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  channel    notify_channel not null default 'IN_APP',
  title      text not null,
  body       text,
  severity   text not null default 'INFO',     -- INFO|WARN|DANGER|REWARD
  link       text,
  state      notify_state not null default 'QUEUED',
  scheduled_for timestamptz not null default now(),
  sent_at    timestamptz,
  error      text,
  meta       jsonb,
  created_at timestamptz not null default now()
);
create index idx_notif_queue  on public.notifications (state, scheduled_for) where state = 'QUEUED';
create index idx_notif_hunter on public.notifications (hunter_id, created_at desc);

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  hunter_id  uuid not null default auth.uid() references public.hunters(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.user_settings (
  hunter_id        uuid primary key default auth.uid() references public.hunters(id) on delete cascade,
  email            text,
  email_enabled    boolean not null default true,
  push_enabled     boolean not null default true,
  quiet_hours_start smallint default 22 check (quiet_hours_start between 0 and 23),
  quiet_hours_end   smallint default 7  check (quiet_hours_end between 0 and 23),
  daily_quest_time  time not null default '06:00',
  eval_hour         smallint not null default 23 check (eval_hour between 0 and 23),
  system_voice      text not null default 'STRICT',   -- STRICT|MENTOR|RUTHLESS
  reduce_motion     boolean not null default false,
  ai_daily_token_cap int not null default 120000,
  updated_at       timestamptz not null default now()
);

-- Content-addressed AI response cache. Kills duplicate spend.
create table public.ai_cache (
  cache_key   text primary key,               -- sha256(action + normalised payload + model)
  action      text not null,
  response    jsonb not null,
  model       text,
  hits        int not null default 0,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index idx_ai_cache_exp on public.ai_cache (expires_at);

create table public.ai_usage (
  id         bigserial primary key,
  hunter_id  uuid default auth.uid() references public.hunters(id) on delete cascade,
  action     text not null,
  model      text,
  tokens_in  int not null default 0,
  tokens_out int not null default 0,
  cached     boolean not null default false,
  latency_ms int,
  ok         boolean not null default true,
  error      text,
  usage_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index idx_ai_usage_day on public.ai_usage (hunter_id, usage_date);

-- ---------------------------------------------------------------------------
-- 14. updated_at TRIGGERS
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'hunters','goals','quests','recipes','challenges','holdings','tasks'
  ] loop
    execute format(
      'create trigger trg_touch_%1$s before update on public.%1$I
       for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 15. FK to preserved food_database (added defensively — type may vary)
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    alter table public.food_favorites
      add constraint fk_fav_food foreign key (food_id)
      references public.food_database(food_id) on delete cascade;
  exception when others then
    raise notice 'food_favorites FK skipped: %', sqlerrm;
  end;

  begin
    alter table public.food_logs
      add constraint fk_log_food foreign key (food_id)
      references public.food_database(food_id) on delete set null;
  exception when others then
    raise notice 'food_logs FK skipped: %', sqlerrm;
  end;

  begin
    alter table public.recipe_ingredients
      add constraint fk_ing_food foreign key (food_id)
      references public.food_database(food_id) on delete set null;
  exception when others then
    raise notice 'recipe_ingredients FK skipped: %', sqlerrm;
  end;
end $$;
