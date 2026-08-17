/**
 * POST /api/ai   { action, ...payload }
 *
 * User-facing entry point for every AI feature. One endpoint means one place
 * that owns the key, the cache, the budget, the retries and the audit trail.
 */
import { runAction } from './_lib/engine.js';
import { requireHunter, logUsage, json, fail } from './_lib/db.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Use POST' });

  let hunterId = null;
  let action = 'unknown';

  try {
    const { hunter } = await requireHunter(req);
    hunterId = hunter.id;

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    action = body.action || 'unknown';

    const result = await runAction({ hunter, body });
    return json(res, 200, result);
  } catch (err) {
    await logUsage({
      hunter_id: hunterId, action, cached: false,
      ok: false, error: String(err?.message || err).slice(0, 300),
    });
    return fail(res, err);
  }
}
