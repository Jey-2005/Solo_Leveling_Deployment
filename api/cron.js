/**
 * GET|POST /api/cron?job=<name>
 * Guarded by CRON_SECRET. Wired up in vercel.json.
 *
 *   hourly  — expire overdue quests, apply penalties, queue task reminders
 *   daily   — roll streaks, run evaluations, issue tomorrow's quest board
 *
 * The daily job deliberately batches: one evaluation and one board per hunter
 * per day, generated once server-side rather than on every app open. That is
 * the difference between a handful of model calls a day and hundreds.
 */
import { admin, requireCronSecret, json, fail } from './_lib/db.js';

const BASE = process.env.PUBLIC_BASE_URL || '';
const today = () => new Date().toISOString().slice(0, 10);

async function callAi(action, jwtless = {}) {
  // Cron drives the same gateway logic through an internal call rather than
  // duplicating it. It authenticates with the service key, not a user JWT.
  const res = await fetch(`${BASE}/api/ai-internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET },
    body: JSON.stringify({ action, ...jwtless }),
  });
  return res.json();
}

/* ------------------------------------------------------------------ */
async function hourly() {
  const out = {};

  const { data: expired } = await admin.rpc('expire_quests');
  out.quests_expired = expired ?? 0;

  // Task reminders: anything due inside its lead time that hasn't been nudged.
  const horizon = new Date(Date.now() + 6 * 3600_000).toISOString();
  const { data: due } = await admin.from('tasks')
    .select('id,hunter_id,title,due_at,remind_before_min,remind_email,remind_push,priority')
    .eq('completed', false)
    .is('reminded_at', null)
    .not('due_at', 'is', null)
    .lte('due_at', horizon)
    .limit(200);

  const now = Date.now();
  const rows = [];
  for (const t of due || []) {
    const fireAt = new Date(t.due_at).getTime() - (t.remind_before_min || 30) * 60_000;
    if (fireAt > now) continue;

    const mins = Math.round((new Date(t.due_at).getTime() - now) / 60_000);
    const when = mins < 0 ? `${Math.abs(mins)} minutes overdue` : `due in ${mins} minutes`;

    for (const ch of [t.remind_email && 'EMAIL', t.remind_push && 'PUSH'].filter(Boolean)) {
      rows.push({
        hunter_id: t.hunter_id, channel: ch,
        title: mins < 0 ? 'QUEST OVERDUE' : 'QUEST DEADLINE APPROACHING',
        body: `${t.title} — ${when}.`,
        severity: mins < 0 ? 'DANGER' : 'WARN',
        link: `${BASE}/tasks`,
        meta: { fields: { Task: t.title, Due: new Date(t.due_at).toLocaleString() } },
      });
    }
    await admin.from('tasks').update({ reminded_at: new Date().toISOString() }).eq('id', t.id);
  }

  if (rows.length) await admin.from('notifications').insert(rows);
  out.reminders_queued = rows.length;

  if (BASE) {
    try {
      const r = await fetch(`${BASE}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET },
        body: JSON.stringify({ drain: true }),
      });
      out.notify = await r.json();
    } catch (e) { out.notify_error = String(e.message); }
  }

  // Expire stale cache rows so the table doesn't grow without bound.
  await admin.from('ai_cache').delete().lt('expires_at', new Date().toISOString());

  return out;
}

/* ------------------------------------------------------------------ */
async function daily() {
  const out = {};

  const { data: rolled } = await admin.rpc('roll_streaks');
  out.streaks_rolled = rolled ?? 0;

  // Only evaluate hunters who have actually been active — no point spending
  // tokens judging an empty fortnight, and no point nagging a dormant account.
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const { data: active } = await admin
    .from('xp_ledger').select('hunter_id').gte('occurred_on', since);
  const activeIds = [...new Set((active || []).map((r) => r.hunter_id))];
  out.active_hunters = activeIds.length;

  if (!BASE) { out.skipped = 'PUBLIC_BASE_URL not set'; return out; }

  let evaluated = 0, boards = 0;
  for (const id of activeIds) {
    const { data: h } = await admin.from('hunters')
      .select('id,last_eval_at').eq('id', id).single();

    // Evaluate at most every 3 days per hunter.
    const stale = !h?.last_eval_at ||
      Date.now() - new Date(h.last_eval_at).getTime() > 3 * 86400000;

    try {
      if (stale) { await callAi('evaluate', { hunter_id: id }); evaluated++; }
      const { data: existing } = await admin.from('quests').select('id')
        .eq('hunter_id', id).eq('quest_date', today()).limit(1);
      if (!existing?.length) {
        await callAi('generate_quests', { hunter_id: id, date: today() });
        boards++;
      }
    } catch (e) {
      console.error('[cron.daily]', id, e.message);
    }
  }

  out.evaluated = evaluated;
  out.boards_issued = boards;
  return out;
}

export default async function handler(req, res) {
  try {
    requireCronSecret(req);
    const job = (req.query?.job || 'hourly').toString();
    const started = Date.now();
    const result = job === 'daily' ? await daily() : await hourly();
    return json(res, 200, { ok: true, job, ms: Date.now() - started, ...result });
  } catch (err) {
    return fail(res, err);
  }
}
