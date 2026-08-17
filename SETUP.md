# SETUP — 15 minutes

A checklist. Full explanations are in README.md.

---

## 1 · Database (5 min)

Supabase dashboard → **SQL Editor** → run these **in order**, one at a time:

| # | File | What it does |
|---|------|--------------|
| 1 | `database/01_schema.sql` | Drops legacy tables, creates ~40 new ones |
| 2 | `database/02_functions.sql` | XP engine, food search, telemetry, safe RPCs |
| 3 | `database/03_rls.sql` | Row-level security + role grants |
| 4 | `database/04_seed.sql` | 28 workout modalities, 81 exercises |

**File 1 is destructive.** It drops `workouts`, `expenses`, `portfolio`,
`food_logs`, `tasks`, `skills`, `savings_goals`, `sip_entries`, `options_trades`,
`macro_logs`. **`food_database` survives** — it only gains three columns and an
index. Back up anything you care about first.

Verify:

```sql
select count(*) from food_database;    -- your ~1014 rows, untouched
select count(*) from workout_types;    -- 28
select count(*) from exercises;        -- 81
```

---

## 2 · Keys (5 min)

```bash
cp .env.example .env
```

**Supabase** → Project Settings → API:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY` | `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key |

> The anon key is *designed* to be public — RLS protects the data. The
> service-role key bypasses RLS entirely. **Never** give it a `VITE_` prefix;
> anything `VITE_*` is compiled into the browser bundle.

**Gemini** → https://aistudio.google.com/apikey → `GEMINI_API_KEY`.

**Gmail** → Google Account → Security → 2-Step Verification → App passwords.
Set `GMAIL_USER` to the mailbox that owns the password. Gmail rewrites the
`From` header to that mailbox unless the address is a verified alias, so a
mismatch means your branded sender is silently replaced.

**Push:**

```bash
npx web-push generate-vapid-keys
```

Public key goes in **both** `VAPID_PUBLIC_KEY` and `VITE_VAPID_PUBLIC_KEY`.

**Cron:**

```bash
openssl rand -hex 32     # -> CRON_SECRET
```

---

## 3 · Run (2 min)

```bash
npm install
npm run dev        # UI only, :5173
vercel dev         # UI + serverless functions
```

Sign up → the Awakening flow collects your identity, measurements and goals,
then issues your first quest board.

---

## 4 · Deploy (3 min)

```bash
npm i -g vercel
vercel --prod
```

Paste every `.env` variable into Vercel → Settings → Environment Variables.
Set `PUBLIC_BASE_URL` to the deployed URL. The two cron jobs come from
`vercel.json` automatically:

- hourly — expire quests, apply penalties, send reminders
- daily 00:30 — roll streaks, evaluate, issue quests

---

## Troubleshooting

**"permission denied for table X"** — `03_rls.sql` didn't finish. Re-run it.

**Quests won't generate** — check `GEMINI_API_KEY`, then Settings → today's token
usage. At the cap the System falls back to deterministic quests and says so.

**No emails** — `GMAIL_USER` must be the mailbox owning the app password, and an
app password needs 2FA switched on. Check the `notifications` table: rows stuck in
`QUEUED` mean cron isn't running; `error` values mean SMTP rejected it.

**Push does nothing** — needs HTTPS (or localhost), both VAPID vars set, and
browser permission granted. iOS requires the PWA be installed to the home screen.

**Model name rejected** — swap `GEMINI_MODEL_FAST` to `gemini-3.5-flash-lite`.
No code change; it's read from the environment.
