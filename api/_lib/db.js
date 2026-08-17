/**
 * Server-side Supabase access, auth, response cache and spend controls.
 * Everything in /api goes through here.
 */
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!URL) console.warn('[db] SUPABASE_URL is not set');

/** Full-privilege client. Bypasses RLS — never expose its results blindly. */
export const admin = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Resolve the caller from their Authorization: Bearer <jwt> header.
 * Returns the hunter row, or throws 401.
 */
export async function requireHunter(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    const e = new Error('Missing bearer token'); e.status = 401; throw e;
  }

  const scoped = createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error } = await scoped.auth.getUser();
  if (error || !user) {
    const e = new Error('Invalid or expired session'); e.status = 401; throw e;
  }

  const { data: hunter } = await admin
    .from('hunters').select('*').eq('id', user.id).single();
  if (!hunter) {
    const e = new Error('Hunter profile not found'); e.status = 404; throw e;
  }

  return { user, hunter, scoped };
}

/** Shared secret guard for cron endpoints. */
export function requireCronSecret(req) {
  const provided =
    req.headers['x-cron-secret'] ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }
}

/* ------------------------------------------------------------------ *
 * Response cache
 * ------------------------------------------------------------------ */

/**
 * TTL per action, in minutes. Actions absent from this map are never cached.
 * Anything that must reflect a specific submission (grading, validation)
 * is deliberately excluded — caching those would let a hunter replay a pass.
 */
export const CACHE_TTL_MIN = {
  body_insight:    60 * 24 * 3,   // deterministic inputs -> stable narrative
  nutrition_coach: 60 * 6,
  parse_meal:      60 * 24 * 30,  // "2 rotis and dal" always parses the same
  finance_audit:   60 * 12,
  generate_quests: 60 * 2,        // re-opening the app shouldn't reroll the board
};

export function cacheKey(action, payload, model) {
  const norm = JSON.stringify(payload, Object.keys(payload || {}).sort());
  return crypto.createHash('sha256')
    .update(`${action}::${model}::${norm}`)
    .digest('hex');
}

export async function cacheGet(key) {
  const { data } = await admin
    .from('ai_cache').select('response, hits')
    .eq('cache_key', key).gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  admin.from('ai_cache').update({ hits: (data.hits || 0) + 1 })
    .eq('cache_key', key).then(() => {}, () => {});
  return data.response;
}

export async function cacheSet(key, action, response, model, ttlMin) {
  if (!ttlMin) return;
  await admin.from('ai_cache').upsert({
    cache_key: key,
    action,
    response,
    model,
    expires_at: new Date(Date.now() + ttlMin * 60_000).toISOString(),
  }, { onConflict: 'cache_key' });
}

/* ------------------------------------------------------------------ *
 * Spend controls
 * ------------------------------------------------------------------ */

/** Reject the call if the hunter has burned their daily token allowance. */
export async function assertBudget(hunterId) {
  const { data: settings } = await admin
    .from('user_settings').select('ai_daily_token_cap')
    .eq('hunter_id', hunterId).maybeSingle();

  const cap = settings?.ai_daily_token_cap ?? 120000;

  const { data: rows } = await admin
    .from('ai_usage').select('tokens_in, tokens_out')
    .eq('hunter_id', hunterId)
    .eq('usage_date', new Date().toISOString().slice(0, 10))
    .eq('cached', false);

  const used = (rows || []).reduce((s, r) => s + (r.tokens_in || 0) + (r.tokens_out || 0), 0);
  if (used >= cap) {
    const e = new Error(
      `Daily AI allowance reached (${used.toLocaleString()} / ${cap.toLocaleString()} tokens). ` +
      `It resets at midnight, or raise the cap in Settings.`
    );
    e.status = 429;
    throw e;
  }
  return { used, cap };
}

export async function logUsage(row) {
  try { await admin.from('ai_usage').insert(row); } catch { /* never block on telemetry */ }
}

/* ------------------------------------------------------------------ *
 * HTTP helpers
 * ------------------------------------------------------------------ */
export function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export function fail(res, err) {
  const status = err?.status || 500;
  if (status >= 500) console.error('[api]', err);
  json(res, status, {
    error: err?.message || 'Unexpected error',
    detail: process.env.NODE_ENV === 'development' ? err?.detail : undefined,
  });
}
