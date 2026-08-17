/**
 * POST /api/notify
 *
 * Drains the notification queue. Called by the reminder cron, and directly by
 * the client for "send me this now" actions.
 *
 * Gmail note: Google rewrites the From header to the authenticated mailbox
 * unless the address is a verified alias on that account. Set GMAIL_USER to the
 * mailbox that owns the app password (levelup@gmail.com), and the display name
 * carries the branding.
 */
import nodemailer from 'nodemailer';
import webpush from 'web-push';
import { admin, requireCronSecret, requireHunter, json, fail } from './_lib/db.js';

let mailer = null;
function getMailer() {
  if (mailer) return mailer;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    pool: true, maxConnections: 3, maxMessages: 50,
  });
  return mailer;
}

let pushReady = false;
function initPush() {
  if (pushReady) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:levelup@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  pushReady = true;
  return true;
}

const ACCENT = { INFO: '#3EC6FF', WARN: '#F5C542', DANGER: '#FF3B5C', REWARD: '#A78BFA' };

/** Dark "system window" email. Table-based so it survives Gmail and Outlook. */
function emailHtml({ title, body, severity = 'INFO', hunterName, link, meta }) {
  const accent = ACCENT[severity] || ACCENT.INFO;
  const rows = Object.entries(meta || {})
    .map(([k, v]) => `<tr>
        <td style="padding:6px 0;color:#7A8699;font-size:12px;letter-spacing:.06em;text-transform:uppercase;">${k}</td>
        <td style="padding:6px 0;color:#E6EDF7;font-size:14px;text-align:right;font-weight:600;">${v}</td>
      </tr>`).join('');

  return `<!doctype html><html><body style="margin:0;padding:0;background:#05060B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05060B;padding:32px 16px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0A0E1A;border:1px solid ${accent}44;">

    <tr><td style="height:2px;background:linear-gradient(90deg,transparent,${accent},transparent);"></td></tr>

    <tr><td style="padding:26px 30px 8px;">
      <div style="color:${accent};font-size:11px;letter-spacing:.32em;text-transform:uppercase;font-family:'Courier New',monospace;">
        &#91; System Notification &#93;
      </div>
    </td></tr>

    <tr><td style="padding:6px 30px 0;">
      <h1 style="margin:0;color:#F2F6FC;font-size:23px;line-height:1.25;font-family:Georgia,'Times New Roman',serif;font-weight:700;letter-spacing:-.01em;">
        ${title}
      </h1>
    </td></tr>

    <tr><td style="padding:14px 30px 0;">
      <p style="margin:0;color:#B8C4D6;font-size:15px;line-height:1.65;">${(body || '').replace(/\n/g, '<br>')}</p>
    </td></tr>

    ${rows ? `<tr><td style="padding:20px 30px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="border-top:1px solid #1C2434;border-bottom:1px solid #1C2434;">
        ${rows}
      </table></td></tr>` : ''}

    ${link ? `<tr><td style="padding:24px 30px 0;">
      <a href="${link}" style="display:inline-block;background:${accent};color:#05060B;
         text-decoration:none;padding:12px 26px;font-weight:700;font-size:13px;
         letter-spacing:.1em;text-transform:uppercase;">Open the System</a>
    </td></tr>` : ''}

    <tr><td style="padding:28px 30px 26px;">
      <p style="margin:0;color:#5A6478;font-size:11px;line-height:1.6;">
        ${hunterName ? `Addressed to ${hunterName}. ` : ''}You are receiving this because notifications are enabled in your Solo Leveling System settings.
      </p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

async function deliver(n, settings) {
  const hour = new Date().getHours();
  const qs = settings?.quiet_hours_start ?? 22;
  const qe = settings?.quiet_hours_end ?? 7;
  const quiet = qs > qe ? (hour >= qs || hour < qe) : (hour >= qs && hour < qe);

  // Danger notifications (penalties) always cut through quiet hours.
  if (quiet && n.severity !== 'DANGER') {
    return { skipped: 'quiet hours' };
  }

  if (n.channel === 'EMAIL') {
    if (!settings?.email_enabled) return { skipped: 'email disabled' };
    const tx = getMailer();
    if (!tx) throw new Error('Email is not configured on the server');
    const to = settings.email;
    if (!to) throw new Error('No email address on file');

    await tx.sendMail({
      from: `"THE SYSTEM" <${process.env.GMAIL_USER}>`,
      to,
      subject: `[SYSTEM] ${n.title}`,
      text: `${n.title}\n\n${n.body || ''}${n.link ? `\n\n${n.link}` : ''}`,
      html: emailHtml({ ...n, hunterName: settings.display_name, meta: n.meta?.fields }),
    });
    return { sent: 'email' };
  }

  if (n.channel === 'PUSH') {
    if (!settings?.push_enabled) return { skipped: 'push disabled' };
    if (!initPush()) throw new Error('Push is not configured on the server');

    const { data: subs } = await admin.from('push_subscriptions')
      .select('*').eq('hunter_id', n.hunter_id);
    if (!subs?.length) return { skipped: 'no subscriptions' };

    const payload = JSON.stringify({
      title: n.title, body: n.body, severity: n.severity, link: n.link || '/',
    });

    let ok = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        ok++;
      } catch (e) {
        // 404/410 mean the browser dropped the subscription — clean it up.
        if (e.statusCode === 404 || e.statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', s.id);
        }
      }
    }));
    return { sent: `push x${ok}` };
  }

  return { sent: 'in-app' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Use POST' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    // Two callers: the cron (shared secret, drains the queue) or a signed-in
    // hunter (can only enqueue for themselves).
    let scopeToHunter = null;
    try {
      requireCronSecret(req);
    } catch {
      const { hunter } = await requireHunter(req);
      scopeToHunter = hunter.id;
    }

    if (body.enqueue) {
      const n = body.enqueue;
      const target = scopeToHunter || n.hunter_id;
      if (!target) return json(res, 400, { error: 'hunter_id required' });
      const { data } = await admin.from('notifications').insert({
        hunter_id: target,
        channel: n.channel || 'IN_APP',
        title: String(n.title || 'Notice').slice(0, 200),
        body: n.body || null,
        severity: n.severity || 'INFO',
        link: n.link || null,
        meta: n.meta || null,
        scheduled_for: n.scheduled_for || new Date().toISOString(),
      }).select().single();
      if (body.immediate !== true) return json(res, 200, { ok: true, queued: data.id });
    }

    // Drain
    let q = admin.from('notifications').select('*')
      .eq('state', 'QUEUED')
      .lte('scheduled_for', new Date().toISOString())
      .neq('channel', 'IN_APP')
      .order('scheduled_for')
      .limit(scopeToHunter ? 10 : 60);
    if (scopeToHunter) q = q.eq('hunter_id', scopeToHunter);

    const { data: queue } = await q;
    if (!queue?.length) return json(res, 200, { ok: true, processed: 0 });

    const ids = [...new Set(queue.map((n) => n.hunter_id))];
    const { data: settingsRows } = await admin.from('user_settings').select('*').in('hunter_id', ids);
    const { data: hunterRows } = await admin.from('hunters').select('id,display_name').in('id', ids);
    const nameOf = Object.fromEntries((hunterRows || []).map((h) => [h.id, h.display_name]));
    const settingsOf = Object.fromEntries(
      (settingsRows || []).map((s) => [s.hunter_id, { ...s, display_name: nameOf[s.hunter_id] }]));

    const results = await Promise.allSettled(queue.map(async (n) => {
      try {
        const out = await deliver(n, settingsOf[n.hunter_id]);
        await admin.from('notifications').update({
          state: out.skipped ? 'QUEUED' : 'SENT',
          sent_at: out.skipped ? null : new Date().toISOString(),
          // push a skipped item past the quiet window rather than retrying in a loop
          scheduled_for: out.skipped
            ? new Date(Date.now() + 60 * 60_000).toISOString()
            : n.scheduled_for,
          error: out.skipped || null,
        }).eq('id', n.id);
        return out;
      } catch (e) {
        await admin.from('notifications').update({
          state: 'FAILED', error: String(e.message).slice(0, 300),
        }).eq('id', n.id);
        throw e;
      }
    }));

    return json(res, 200, {
      ok: true,
      processed: queue.length,
      delivered: results.filter((r) => r.status === 'fulfilled' && !r.value.skipped).length,
      failed: results.filter((r) => r.status === 'rejected').length,
    });
  } catch (err) {
    return fail(res, err);
  }
}
