/**
 * POST /api/ai-internal   { action, hunter_id, ... }
 *
 * Same engine as /api/ai, but authenticated with CRON_SECRET instead of a user
 * JWT so scheduled jobs can act on a hunter's behalf. Never exposed to the
 * browser — the secret lives only in the server environment.
 */
import { runAction } from './_lib/engine.js';
import { admin, requireCronSecret, json, fail } from './_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Use POST' });

  try {
    requireCronSecret(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!body.hunter_id) return json(res, 400, { error: 'hunter_id is required' });

    const { data: hunter } = await admin.from('hunters')
      .select('*').eq('id', body.hunter_id).single();
    if (!hunter) return json(res, 404, { error: 'Hunter not found' });

    const result = await runAction({ hunter, body });
    return json(res, 200, result);
  } catch (err) {
    return fail(res, err);
  }
}
