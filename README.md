# THE SYSTEM

A self-development app built on the premise of *Solo Leveling*: you log the work,
the System judges it, and your level reflects what you actually did.

Stack: **React 18 + Vite** · **Supabase (Postgres 16)** · **Gemini** ·
**Vercel serverless functions**.

---

## What makes the levelling non-mechanical

Most "gamified" trackers add a fixed number of points per action. This one has two layers:

**Layer 1 — deterministic XP (Postgres).** Every action has a base value, a per-day
cap per source, and an audit row in `xp_ledger`. This never touches the AI, so it
can't hallucinate a reward and it can't be farmed.

**Layer 2 — AI evaluation.** Every few days the System reads a compact digest of your
last 14 days and returns:

| Output | Range | Effect |
|---|---|---|
| `stat_multipliers` | 0.5 – 2.0 | Scales **all future XP** for that attribute |
| `difficulty_scalar` | 0.5 – 3.0 | Scales tomorrow's quest targets |
| `integrity_score` | 0 – 100 | Drops when logging looks implausible |

So two people doing identical workouts diverge: the one who has been consistent for
six weeks earns at ×1.6 and gets harder quests; the one who logs three sessions then
vanishes drops to ×0.7. **The multipliers are the level system** — the base numbers
are just the raw material.

Six attributes: **STR** (resistance work) · **VIT** (nutrition, recovery, body
composition) · **AGI** (conditioning) · **INT** (skills) · **PER** (financial
discipline) · **WIL** (streaks, deadlines).

---

## Setup

### 1. Database

In the Supabase SQL editor, run the four files **in order**:

```
database/01_schema.sql     -- drops legacy tables, creates ~40 new ones
database/02_functions.sql  -- XP engine, food search, telemetry, safe write RPCs
database/03_rls.sql        -- row-level security + role grants
database/04_seed.sql       -- 28 workout modalities, 81 exercises
```

> **`01_schema.sql` is destructive.** It drops the old `workouts`, `expenses`,
> `portfolio`, `food_logs`, `tasks`, `skills`, `savings_goals`, `sip_entries`,
> `options_trades` and `macro_logs` tables. **`food_database` is explicitly
> preserved** — the script only adds `category`, `default_grams` and `search_text`
> columns plus a trigram index. Take a backup first if there's anything you want.

Re-running is safe: teardown is guarded, seeds upsert rather than truncate.

### 2. Environment

Copy `.env.example` to `.env` and fill it in. Two things that bite people:

- **Never** prefix the service-role key with `VITE_`. Anything `VITE_*` is compiled
  into the browser bundle. The anon key *is* meant to be public — RLS is what
  protects your data — but the service-role key bypasses RLS entirely.
- **Gmail rewrites the `From` header** to the authenticated mailbox unless the
  address is a verified alias on that account. Set `GMAIL_USER` to the mailbox that
  actually owns the app password; the display name carries the branding.

Generate VAPID keys for push:

```bash
npx web-push generate-vapid-keys
```

Put the public key in **both** `VAPID_PUBLIC_KEY` and `VITE_VAPID_PUBLIC_KEY`.

### 3. Run

```bash
npm install
npm run dev          # Vite on :5173, /api proxied to :3000
vercel dev           # to exercise the serverless functions locally
```

### 4. Deploy

```bash
vercel --prod
```

Add every variable from `.env` to the Vercel project. The two cron jobs in
`vercel.json` wire up automatically:

- **hourly** — expire quests, apply penalties, queue reminders, drain the
  notification outbox, purge expired cache
- **daily 00:30** — roll streaks, run evaluations, issue the quest board

---

## Architecture

```
src/
  components/system/   Panel, Modal, StatusWindow, StatHex radar, toasts
  context/             auth + player state, realtime notification stream
  lib/                 formulas.js (body maths), pdf.js, api.js, utils.js
  features/            auth · onboarding · dashboard · health · finance
                       tasks · skills · settings
api/
  ai.js                single AI gateway (user JWT)
  ai-internal.js       same engine, cron-authenticated
  _lib/engine.js       enrich → cache → budget → model → effects
  _lib/prompts.js      11 actions, each with schema + deterministic fallback
  notify.js            email + web push
  cron.js              scheduled jobs
database/              the four migration files
```

### Token efficiency

Four things keep spend low:

1. **`build_telemetry()`** collapses two weeks of activity across every domain into
   a **~1.2 KB JSON digest** (≈350 tokens) instead of sending thousands of rows.
2. **Content-addressed cache** with per-action TTLs. Quest generation caches for 2h,
   body insight for 3 days. Grading and validation are *never* cached — they must
   respond to what you actually wrote.
3. **Per-user daily token budget** (`ai_daily_token_cap`, default 120k), visible in
   Settings.
4. **A deterministic fallback for every one of the 11 actions.** If Gemini is down or
   the budget is spent, the app degrades to rule-based logic and shows a quiet
   "reduced capacity" note. It never hard-fails.

### Security model

The browser sends **intent**, never facts. Anything that grants XP is re-read from
Postgres server-side before it's graded.

- `award_xp`, `build_telemetry`, `apply_evaluation`, `score_workout` are revoked
  from `PUBLIC` (not just from the roles — Postgres grants `EXECUTE` to `PUBLIC`
  by default, which is an easy hole to leave open).
- The three write paths the client *does* need — `submit_workout`, `complete_task`,
  `log_practice` — are `SECURITY DEFINER` wrappers that verify ownership, derive the
  reward from stored values, clamp it, and refuse to pay twice.
- Every table has RLS. `hunter_id` defaults to `auth.uid()`, so a client can't write
  a row it doesn't own even if it tries.
- `xp_ledger` is readable but not writable from the browser.

---

## Verification

The four SQL files were run against a real Postgres 16 in a Supabase-shaped sandbox
(auth schema, `auth.uid()`, anon/authenticated/service_role, a `food_database` with
the production column layout, and dummy legacy tables to prove the teardown works).

**Security**

| Test | Result |
|---|---|
| Client calls `award_xp` directly | blocked |
| Client calls `build_telemetry` | blocked |
| Client writes to `xp_ledger` | blocked |
| Task re-toggled to farm XP | paid 15, then 0, 0, 0 |
| Task with `xp_reward` set to 5000 | clamped to 60 |
| Practice logged as 100,000 minutes | clamped to 600 min / 200 XP |
| Reading another hunter's rows | 0 rows |
| Inserting into another hunter | rejected by RLS |

**Correctness**

- XP curve monotonic; ranks land at E/D/C/B/A/S/National on schedule
- Recipe per-100g math exact: 795 + 236 kcal over a 500 g yield → **206.20**
- Workout scoring pays once, second submit → 0
- Fuzzy food search: `paner` → Paneer 0.67 · `biriyani` → Biryani 0.55 ·
  `chiken` → Chicken 0.50 · nonsense → 0 results
- Body formulas hand-checked: BMI 24.7, Navy body fat 16.1%, BMR 1780 (Mifflin)
- Macro splits reconcile to their calorie target within rounding

### Progression pacing

The first curve needed 3.2M XP for S-rank — about 25 years of real effort. Recalibrated
to `40 × level^1.25`:

| Rank | Level | Total XP | Roughly |
|---|---|---|---|
| D | 10 | 2,808 | 1 week |
| C | 25 | 23,724 | 2 months |
| B | 45 | 90,897 | 7 months |
| A | 65 | 209,559 | 1.5 years |
| S | 85 | 384,813 | 2.6 years |
| National | 100 | 555,822 | — |

Fast early, brutal late.

---

## A note on the artwork

The entire aesthetic is built from CSS and hand-written SVG. **No Solo Leveling
artwork, characters, logos or text are bundled** — that material is copyrighted, and
shipping it would expose you to a takedown. The look comes from the visual grammar
of the system-window itself: clipped corners, bracket registration marks, mana-blue
for information, monarch-violet for things you earned, red for penalties.

This is an original work inspired by the premise. It is not affiliated with or
endorsed by the rights holders.

---

## Health disclaimer

The body report uses published population-level formulas (Mifflin-St Jeor,
Katch-McArdle, US Navy circumference method, Deurenberg, WHO BMI bands including the
lower Asian cut-offs). **Every value is an estimate, not a measurement**, and
circumference-based body-fat figures in particular can be several points off. Nothing
in the app is medical advice. The full disclaimer ships in the PDF and is shown in the
UI. The calorie-target field warns below 1,200 kcal and the formulas enforce a floor.
