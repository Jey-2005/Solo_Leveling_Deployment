/**
 * The AI engine. Shared by /api/ai (user-authenticated) and /api/ai-internal
 * (cron-authenticated), so both paths run byte-identical logic.
 *
 * Security model: the client sends intent, never facts. For anything that
 * grants XP, the server re-reads the authoritative rows from Postgres, builds
 * the prompt from those, and writes the result itself. A modified client can
 * ask for a grading; it cannot decide the outcome.
 */
import { generate } from './gemini.js';
import { ACTIONS } from './prompts.js';
import {
  admin, assertBudget, logUsage,
  cacheKey, cacheGet, cacheSet, CACHE_TTL_MIN,
} from './db.js';

const STATS = ['STR', 'VIT', 'AGI', 'INT', 'PER', 'WIL'];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
const today = () => new Date().toISOString().slice(0, 10);

/** Everything the hunter objectively did today. Used to catch inflated claims. */
async function todayActivity(hunterId) {
  const d = today();
  const [w, f, t, s, x] = await Promise.all([
    admin.from('workout_sessions').select('type_code,duration_min,intensity,total_volume_kg')
      .eq('hunter_id', hunterId).eq('session_date', d),
    admin.from('v_nutrition_daily').select('kcal,protein_g,entries')
      .eq('hunter_id', hunterId).eq('log_date', d).maybeSingle(),
    admin.from('tasks').select('title').eq('hunter_id', hunterId)
      .eq('completed', true).gte('completed_at', `${d}T00:00:00Z`),
    admin.from('skill_sessions').select('minutes,focus')
      .eq('hunter_id', hunterId).eq('session_date', d),
    admin.from('transactions').select('amount,category,is_planned')
      .eq('hunter_id', hunterId).eq('txn_date', d),
  ]);
  return {
    workouts: w.data || [],
    nutrition: f.data || null,
    tasks_done: (t.data || []).map((r) => r.title),
    skill_minutes: (s.data || []).reduce((a, r) => a + (r.minutes || 0), 0),
    transactions: x.data || [],
  };
}

async function statMultipliers(hunterId) {
  const { data } = await admin.from('hunter_stats')
    .select('stat,value,multiplier').eq('hunter_id', hunterId);
  return Object.fromEntries((data || []).map((r) => [r.stat, { v: r.value, mult: Number(r.multiplier) }]));
}

/* ==================================================================== *
 * Per-action server-side enrichment.
 * Returns { payload, cacheable, meta } — meta is passed to the effect step.
 * ==================================================================== */
const ENRICH = {
  async evaluate({ hunter }) {
    const { data: tel } = await admin.rpc('build_telemetry', { p_hunter: hunter.id, p_days: 14 });
    const stats = await statMultipliers(hunter.id);
    const days = hunter.last_eval_at
      ? Math.round((Date.now() - new Date(hunter.last_eval_at)) / 86400000)
      : null;
    return {
      payload: {
        telemetry: tel,
        current_multipliers: Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, v.mult])),
        current_difficulty: Number(hunter.difficulty_scalar),
        days_since: days,
      },
      cacheable: false,
      meta: { telemetry: tel },
    };
  },

  async generate_quests({ hunter, body }) {
    const d = body?.date || today();
    const [{ data: tel }, goals, yest, stats, lastEval] = await Promise.all([
      admin.rpc('build_telemetry', { p_hunter: hunter.id, p_days: 14 }),
      admin.from('goals').select('title,detail,domain,deadline,metric_name,metric_target,metric_unit,priority')
        .eq('hunter_id', hunter.id).eq('state', 'ACTIVE').order('priority').limit(8),
      admin.from('quests').select('title,stat').eq('hunter_id', hunter.id)
        .eq('quest_date', new Date(Date.now() - 86400000).toISOString().slice(0, 10)),
      statMultipliers(hunter.id),
      admin.from('ai_evaluations').select('weakest_stat').eq('hunter_id', hunter.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    // Fall back to the lowest attribute if no evaluation has run yet.
    const weakest = lastEval.data?.weakest_stat
      || Object.entries(stats).sort((a, b) => a[1].v - b[1].v)[0]?.[0]
      || 'WIL';

    return {
      payload: {
        level: hunter.level, rank: hunter.rank, streak: hunter.streak_days,
        difficulty: Number(hunter.difficulty_scalar),
        weakest, stats,
        goals: goals.data || [],
        telemetry: tel,
        yesterday: yest.data || [],
        today: d,
        weekday: new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }),
      },
      cacheable: true,
      meta: { date: d },
    };
  },

  async validate_quest({ hunter, body }) {
    const { data: quest } = await admin.from('quests').select('*')
      .eq('id', body.quest_id).eq('hunter_id', hunter.id).single();
    if (!quest) { const e = new Error('Quest not found'); e.status = 404; throw e; }
    if (quest.state === 'CLEARED') { const e = new Error('Quest already cleared'); e.status = 409; throw e; }

    return {
      payload: {
        quest: {
          title: quest.title, objective: quest.objective,
          success_criteria: quest.success_criteria,
          target_value: quest.target_value, target_unit: quest.target_unit,
          xp_reward: quest.xp_reward,
        },
        proof_text: body.proof_text,
        proof_value: body.proof_value,
        today_activity: await todayActivity(hunter.id),
      },
      cacheable: false,
      meta: { quest },
    };
  },

  async body_insight({ hunter, body }) {
    const { data: trend } = await admin.from('body_metrics')
      .select('measured_on,weight_kg,body_fat_pct,waist_cm')
      .eq('hunter_id', hunter.id).order('measured_on', { ascending: false }).limit(8);
    return {
      payload: { computed: body.computed, trend: trend || [], goal: body.goal },
      cacheable: true,
      meta: { report_id: body.report_id },
    };
  },

  async challenge_design({ hunter, body }) {
    const { data: tel } = await admin.rpc('build_telemetry', { p_hunter: hunter.id, p_days: 30 });
    return {
      payload: {
        premise: body.premise,
        total_days: clamp(body.total_days || 100, 3, 365),
        strictness: clamp(body.strictness || 3, 1, 5),
        level: hunter.level, best_streak: hunter.best_streak,
        telemetry: tel,
      },
      cacheable: false,
      meta: { body },
    };
  },

  async challenge_day({ hunter, body }) {
    const { data: ch } = await admin.from('challenges').select('*')
      .eq('id', body.challenge_id).eq('hunter_id', hunter.id).single();
    if (!ch) { const e = new Error('Challenge not found'); e.status = 404; throw e; }
    if (ch.state !== 'ACTIVE') { const e = new Error('Challenge is not active'); e.status = 409; throw e; }

    const { data: day } = await admin.from('challenge_days').select('*')
      .eq('challenge_id', ch.id).eq('day_index', body.day_index).single();
    if (!day) { const e = new Error('Day not found'); e.status = 404; throw e; }
    if (day.verdict !== 'PENDING') { const e = new Error('Day already judged'); e.status = 409; throw e; }

    return {
      payload: {
        charter: ch.charter, day_index: day.day_index, total_days: ch.total_days,
        requirements: day.requirements,
        passes: ch.passes, partials: ch.partials, fails: ch.fails,
        streak: ch.current_streak, lives: ch.lives,
        report_text: body.report_text,
        today_activity: await todayActivity(hunter.id),
      },
      cacheable: false,
      meta: { challenge: ch, day },
    };
  },

  async skill_exam_generate({ hunter, body }) {
    const { data: skill } = await admin.from('skills').select('*')
      .eq('id', body.skill_id).eq('hunter_id', hunter.id).single();
    if (!skill) { const e = new Error('Skill not found'); e.status = 404; throw e; }
    if (skill.next_eligible_at && new Date(skill.next_eligible_at) > new Date()) {
      const e = new Error(
        `Reassessment locked until ${new Date(skill.next_eligible_at).toLocaleString()}. Practise first.`);
      e.status = 429; throw e;
    }

    const { data: sessions } = await admin.from('skill_sessions')
      .select('minutes,focus,what_built,session_date,difficulty')
      .eq('skill_id', skill.id).order('session_date', { ascending: false }).limit(60);

    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const recent = (sessions || []).filter((s) => s.session_date >= cutoff);

    const practice = {
      sessions: sessions?.length || 0,
      minutes: (sessions || []).reduce((a, s) => a + s.minutes, 0),
      sessions_30d: recent.length,
      minutes_30d: recent.reduce((a, s) => a + s.minutes, 0),
      weekly_target: skill.weekly_target_min,
      focuses: [...new Set((sessions || []).map((s) => s.focus).filter(Boolean))].slice(0, 10),
      built: (sessions || []).map((s) => s.what_built).filter(Boolean).slice(0, 10),
    };

    return {
      payload: {
        skill_name: skill.name, domain: skill.domain, description: skill.description,
        current_level: skill.level,
        target_level: clamp(body.target_level || skill.level + 1, 1, 10),
        practice,
      },
      cacheable: false,
      meta: { skill, practice, target_level: clamp(body.target_level || skill.level + 1, 1, 10) },
    };
  },

  async skill_exam_grade({ hunter, body }) {
    const { data: exam } = await admin.from('skill_assessments').select('*')
      .eq('id', body.assessment_id).eq('hunter_id', hunter.id).single();
    if (!exam) { const e = new Error('Assessment not found'); e.status = 404; throw e; }
    if (exam.state !== 'IN_PROGRESS') { const e = new Error('Assessment already submitted'); e.status = 409; throw e; }

    const { data: skill } = await admin.from('skills').select('*').eq('id', exam.skill_id).single();

    return {
      payload: {
        skill_name: skill.name,
        target_level: exam.target_level,
        pass_mark: exam.pass_mark,
        questions: exam.questions,
        answers: body.answers,
        practice: exam.practice_snapshot,
      },
      cacheable: false,
      meta: { exam, skill, answers: body.answers },
    };
  },

  async finance_audit({ hunter, body }) {
    const end = body.period_end || today();
    const start = body.period_start
      || new Date(new Date(end).getFullYear(), new Date(end).getMonth(), 1).toISOString().slice(0, 10);

    const [txns, budgets, goals] = await Promise.all([
      admin.from('transactions').select('kind,amount,category,is_planned')
        .eq('hunter_id', hunter.id).gte('txn_date', start).lte('txn_date', end),
      admin.from('budgets').select('category,monthly_cap').eq('hunter_id', hunter.id),
      admin.from('savings_goals').select('name,target_amount,saved_amount').eq('hunter_id', hunter.id),
    ]);

    const rows = txns.data || [];
    const income = rows.filter((r) => r.kind === 'INCOME').reduce((a, r) => a + Number(r.amount), 0);
    const spend = rows.filter((r) => r.kind === 'EXPENSE').reduce((a, r) => a + Number(r.amount), 0);
    const impulse = rows.filter((r) => r.kind === 'EXPENSE' && !r.is_planned)
      .reduce((a, r) => a + Number(r.amount), 0);
    const byCat = {};
    rows.filter((r) => r.kind === 'EXPENSE')
      .forEach((r) => { byCat[r.category] = (byCat[r.category] || 0) + Number(r.amount); });

    const metrics = {
      income: Math.round(income), spend: Math.round(spend),
      net: Math.round(income - spend),
      impulse_spend: Math.round(impulse),
      impulse_ratio: spend ? Number((impulse / spend).toFixed(3)) : 0,
      transaction_count: rows.length,
      by_category: Object.fromEntries(
        Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 8)
          .map(([k, v]) => [k, Math.round(v)])),
    };

    return {
      payload: { period_start: start, period_end: end, metrics, budgets: budgets.data, goals: goals.data },
      cacheable: true,
      meta: { start, end, metrics },
    };
  },

  async nutrition_coach({ hunter, body }) {
    const d = body.date || today();
    const [targets, consumed, recent] = await Promise.all([
      admin.from('nutrition_targets').select('*').eq('hunter_id', hunter.id).single(),
      admin.from('v_nutrition_daily').select('*').eq('hunter_id', hunter.id).eq('log_date', d).maybeSingle(),
      admin.from('food_logs').select('label').eq('hunter_id', hunter.id).eq('log_date', d).limit(12),
    ]);
    const t = targets.data || {};
    const c = consumed.data || { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0, fibre_g: 0 };
    const remaining = {
      kcal: Number(t.kcal || 0) - Number(c.kcal || 0),
      protein_g: Number(t.protein_g || 0) - Number(c.protein_g || 0),
      carb_g: Number(t.carb_g || 0) - Number(c.carb_g || 0),
      fat_g: Number(t.fat_g || 0) - Number(c.fat_g || 0),
    };
    return {
      payload: {
        targets: t, consumed: c, remaining,
        time_of_day: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        recent_foods: (recent.data || []).map((r) => r.label),
      },
      cacheable: true,
      meta: {},
    };
  },

  async parse_meal({ body }) {
    return {
      payload: { text: body.text, time_of_day: body.time_of_day },
      cacheable: true,
      meta: {},
    };
  },
};

/* ==================================================================== *
 * Effects — everything that writes to the database after a good response.
 * ==================================================================== */
const EFFECTS = {
  async evaluate({ hunter, data, meta, model, usage }) {
    const mult = {}; const awards = {};
    for (const s of STATS) {
      mult[s] = clamp(data.stat_multipliers?.[s] ?? 1, 0.5, 2);
      awards[s] = Math.round(clamp(data.awarded_xp?.[s] ?? 0, -300, 600));
    }
    const difficulty = clamp(data.difficulty_scalar ?? 1, 0.5, 3);
    const integrity = clamp(data.integrity_score ?? 100, 0, 100);

    const { data: applied } = await admin.rpc('apply_evaluation', {
      p_hunter: hunter.id, p_multipliers: mult, p_awards: awards,
      p_difficulty: difficulty, p_integrity: integrity,
      p_note: data.verdict_title || 'Evaluation',
    });

    await admin.from('ai_evaluations').insert({
      hunter_id: hunter.id,
      period_start: new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10),
      period_end: today(),
      telemetry: meta.telemetry, stat_multipliers: mult, awarded_xp: awards,
      difficulty_scalar: difficulty, integrity_score: integrity,
      verdict_title: data.verdict_title, verdict_body: data.verdict_body,
      weakest_stat: STATS.includes(data.weakest_stat) ? data.weakest_stat : null,
      directive: data.directive, model,
      tokens_in: usage.in, tokens_out: usage.out,
    });

    await admin.from('notifications').insert({
      hunter_id: hunter.id, channel: 'IN_APP',
      title: data.verdict_title || 'EVALUATION COMPLETE',
      body: data.directive, severity: 'INFO', state: 'SENT', sent_at: new Date().toISOString(),
    });

    return { applied, multipliers: mult, awards };
  },

  async generate_quests({ hunter, data, meta }) {
    // Replace only unstarted quests for the day; never delete cleared history.
    await admin.from('quests').delete()
      .eq('hunter_id', hunter.id).eq('quest_date', meta.date)
      .eq('state', 'ACTIVE').eq('ai_generated', true);

    const endOfDay = new Date(`${meta.date}T23:59:59`);
    const rows = (data.quests || []).slice(0, 6).map((q) => ({
      hunter_id: hunter.id,
      kind: q.mandatory ? 'URGENT' : 'DAILY',
      title: String(q.title || 'Untitled').slice(0, 120),
      objective: String(q.objective || '').slice(0, 500),
      success_criteria: String(q.success_criteria || '').slice(0, 500),
      target_value: Number.isFinite(+q.target_value) ? +q.target_value : null,
      target_unit: (q.target_unit || '').slice(0, 24) || null,
      stat: STATS.includes(q.stat) ? q.stat : 'WIL',
      xp_reward: Math.round(clamp(q.xp_reward ?? 30, 5, 140)),
      penalty_xp: q.mandatory ? Math.round(clamp(q.penalty_xp ?? 25, 0, 70)) : 0,
      difficulty: Math.round(clamp(q.difficulty ?? 2, 1, 5)),
      mandatory: !!q.mandatory,
      quest_date: meta.date,
      expires_at: endOfDay.toISOString(),
      ai_generated: true,
      generation_note: (q.rationale || '').slice(0, 240),
    }));

    const { data: inserted } = await admin.from('quests').insert(rows).select();
    return { quests: inserted, board_note: data.board_note };
  },

  async validate_quest({ hunter, data, meta, model }) {
    const q = meta.quest;
    const verdict = ['CLEARED', 'PARTIAL', 'REJECTED'].includes(data.verdict) ? data.verdict : 'REJECTED';
    const mult = verdict === 'REJECTED' ? 0 : clamp(data.xp_multiplier ?? 1, 0, 1.25);
    const xp = Math.round(q.xp_reward * mult);

    await admin.from('quest_submissions').insert({
      quest_id: q.id, hunter_id: hunter.id,
      proof_text: meta.proof_text ?? null,
      verdict, score: Math.round(clamp(data.score ?? 0, 0, 100)),
      ai_response: data.response, ai_followup: data.followup,
      xp_awarded: xp, model,
    });

    await admin.from('quests').update({
      state: verdict === 'CLEARED' ? 'CLEARED' : verdict === 'PARTIAL' ? 'CLEARED' : 'ACTIVE',
    }).eq('id', q.id);

    let award = null;
    if (xp > 0) {
      const { data: r } = await admin.rpc('award_xp', {
        p_hunter: hunter.id, p_stat: q.stat, p_base: xp,
        p_source: 'quest', p_source_id: q.id,
        p_note: q.title, p_daily_cap: 400,
      });
      award = r;
    }
    return { verdict, xp_awarded: xp, award };
  },

  async body_insight({ hunter, data, meta }) {
    if (meta.report_id) {
      await admin.from('body_reports').update({
        ai_summary: data.summary,
        ai_actions: { standout: data.standout, actions: data.actions, risks: data.risk_notes },
      }).eq('id', meta.report_id).eq('hunter_id', hunter.id);
    }
    return {};
  },

  async challenge_design({ hunter, data, meta }) {
    const b = meta.body;
    const totalDays = clamp(b.total_days || 100, 3, 365);
    const { data: ch } = await admin.from('challenges').insert({
      hunter_id: hunter.id,
      title: (data.title || 'Untitled Challenge').slice(0, 120),
      premise: b.premise,
      charter: data,
      total_days: totalDays,
      strictness: clamp(b.strictness || 3, 1, 5),
      lives: Math.round(clamp(data.lives ?? 3, 1, 5)),
      state: 'ACTIVE',
      start_date: today(),
      current_day: 1,
    }).select().single();

    await admin.from('challenge_days').insert({
      challenge_id: ch.id, hunter_id: hunter.id, day_index: 1, day_date: today(),
      brief: data.opening_line,
      requirements: (data.rules || []).map((r) => r.rule).slice(0, 4),
    });

    return { challenge: ch };
  },

  async challenge_day({ hunter, data, meta }) {
    const { challenge: ch, day } = meta;
    const v = ['PASS', 'PARTIAL', 'FAIL'].includes(data.verdict) ? data.verdict : 'FAIL';
    const xp = Math.round(clamp(data.xp ?? 0, 0, 120));

    await admin.from('challenge_days').update({
      report_text: meta.report_text ?? null,
      verdict: v, score: Math.round(clamp(data.score ?? 0, 0, 100)),
      ai_response: data.response, xp_awarded: xp,
      submitted_at: new Date().toISOString(),
    }).eq('id', day.id);

    const passes = ch.passes + (v === 'PASS' ? 1 : 0);
    const partials = ch.partials + (v === 'PARTIAL' ? 1 : 0);
    const fails = ch.fails + (v === 'FAIL' ? 1 : 0);
    const streak = v === 'FAIL' ? 0 : ch.current_streak + 1;
    const lives = v === 'FAIL' ? ch.lives - 1 : ch.lives;
    const nextDay = day.day_index + 1;
    const finished = nextDay > ch.total_days;
    const broken = lives <= 0;

    await admin.from('challenges').update({
      passes, partials, fails,
      current_streak: streak,
      longest_streak: Math.max(ch.longest_streak, streak),
      lives: Math.max(0, lives),
      current_day: finished ? ch.total_days : nextDay,
      state: broken ? 'FAILED' : finished ? 'COMPLETED' : 'ACTIVE',
    }).eq('id', ch.id);

    if (!finished && !broken) {
      const nextDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      await admin.from('challenge_days').upsert({
        challenge_id: ch.id, hunter_id: hunter.id,
        day_index: nextDay, day_date: nextDate,
        brief: data.tomorrow_brief,
        requirements: (data.tomorrow_requirements || []).slice(0, 4),
      }, { onConflict: 'challenge_id,day_index' });
    }

    let award = null;
    if (xp > 0) {
      const { data: r } = await admin.rpc('award_xp', {
        p_hunter: hunter.id, p_stat: 'WIL', p_base: xp,
        p_source: 'challenge', p_source_id: ch.id,
        p_note: `${ch.title} day ${day.day_index}`, p_daily_cap: 200,
      });
      award = r;
    }
    return { verdict: v, xp_awarded: xp, lives: Math.max(0, lives), streak, finished, broken, award };
  },

  async skill_exam_generate({ hunter, data, meta }) {
    const questions = (data.questions || []).slice(0, 8).map((q, i) => ({
      id: q.id || `q${i + 1}`,
      type: ['MCQ', 'SHORT', 'SCENARIO', 'PRACTICE_AUDIT'].includes(q.type) ? q.type : 'SHORT',
      prompt: q.prompt,
      options: q.type === 'MCQ' ? (q.options || []).slice(0, 4) : [],
      weight: Math.round(clamp(q.weight ?? 1, 1, 3)),
      probes: q.probes,
    }));

    const { data: exam } = await admin.from('skill_assessments').insert({
      skill_id: meta.skill.id, hunter_id: hunter.id,
      target_level: meta.target_level,
      questions, practice_snapshot: meta.practice,
      pass_mark: meta.target_level >= 7 ? 82 : meta.target_level >= 4 ? 78 : 75,
    }).select().single();

    // Strip the hidden grading rubric before it reaches the browser.
    return {
      assessment: {
        ...exam,
        questions: questions.map(({ probes, ...rest }) => rest),
      },
      examiner_note: data.examiner_note,
    };
  },

  async skill_exam_grade({ hunter, data, meta }) {
    const { exam, skill } = meta;
    const score = Math.round(clamp(data.score ?? 0, 0, 100));
    const passed = !!data.passed && score >= exam.pass_mark;

    await admin.from('skill_assessments').update({
      answers: meta.answers, score,
      state: passed ? 'PASSED' : 'FAILED',
      per_question: data.per_question,
      examiner_notes: data.examiner_notes,
      integrity_flag: data.integrity_flag || null,
      completed_at: new Date().toISOString(),
    }).eq('id', exam.id);

    if (passed) {
      await admin.from('skills').update({
        level: exam.target_level,
        last_assessed_at: new Date().toISOString(),
        next_eligible_at: null,
      }).eq('id', skill.id);

      await admin.rpc('award_xp', {
        p_hunter: hunter.id, p_stat: 'INT',
        p_base: 60 + exam.target_level * 25,
        p_source: 'assessment', p_source_id: skill.id,
        p_note: `${skill.name} -> level ${exam.target_level}`, p_daily_cap: null,
      });

      await admin.from('notifications').insert({
        hunter_id: hunter.id, channel: 'IN_APP',
        title: 'SKILL RANK INCREASED',
        body: `${skill.name} advanced to level ${exam.target_level}. Score ${score}.`,
        severity: 'REWARD', state: 'SENT', sent_at: new Date().toISOString(),
      });
    } else {
      // 48h lockout stops brute-forcing the examiner.
      await admin.from('skills').update({
        last_assessed_at: new Date().toISOString(),
        next_eligible_at: new Date(Date.now() + 48 * 3600_000).toISOString(),
      }).eq('id', skill.id);
    }

    return { score, passed, pass_mark: exam.pass_mark, new_level: passed ? exam.target_level : skill.level };
  },

  async finance_audit({ hunter, data, meta }) {
    await admin.from('finance_audits').insert({
      hunter_id: hunter.id,
      period_start: meta.start, period_end: meta.end,
      metrics: meta.metrics,
      discipline_score: Math.round(clamp(data.discipline_score ?? 50, 0, 100)),
      verdict: data.verdict, leaks: data.leaks, directives: data.directives,
    });

    // Discipline feeds PER, but only once per calendar month.
    const monthStart = meta.end.slice(0, 7) + '-01';
    const { data: already } = await admin.from('xp_ledger').select('id')
      .eq('hunter_id', hunter.id).eq('source', 'finance_audit')
      .gte('occurred_on', monthStart).limit(1);

    if (!already?.length) {
      const s = clamp(data.discipline_score ?? 50, 0, 100);
      await admin.rpc('award_xp', {
        p_hunter: hunter.id, p_stat: 'PER',
        p_base: Math.round((s - 50) * 4),   // -200 .. +200
        p_source: 'finance_audit', p_source_id: null,
        p_note: `Discipline ${s}/100`, p_daily_cap: null,
      });
    }
    return {};
  },

  async nutrition_coach() { return {}; },
  async parse_meal() { return {}; },
  async body_insight_noop() { return {}; },
};

/* ==================================================================== *
 * runAction — the whole pipeline: enrich, cache, budget, model, effects
 * ==================================================================== */
export async function runAction({ hunter, body }) {
  const started = Date.now();
  const action = body?.action;

  const spec = ACTIONS[action];
  const enrich = ENRICH[action];
  if (!spec || !enrich) {
    const e = new Error(`Unknown action: ${action}`); e.status = 400; throw e;
  }

  const { data: settings } = await admin.from('user_settings')
    .select('system_voice').eq('hunter_id', hunter.id).maybeSingle();
  const ctx = { voice: settings?.system_voice || 'STRICT' };

  const { payload, cacheable, meta } = await enrich({ hunter, body, ctx });
  // carry the hunter's raw text through to whoever writes the row
  meta.proof_text = body.proof_text;
  meta.report_text = body.report_text;

  const ttl = cacheable ? CACHE_TTL_MIN[action] : 0;
  const key = ttl ? cacheKey(action, payload, spec.tier) : null;

  /* ---- cache hit: zero spend, zero latency from the model ---- */
  if (key) {
    const hit = await cacheGet(key);
    if (hit) {
      const effect = EFFECTS[action]
        ? await EFFECTS[action]({ hunter, data: hit, meta, model: 'cache', usage: { in: 0, out: 0 } })
        : {};
      await logUsage({
        hunter_id: hunter.id, action, model: 'cache', cached: true,
        latency_ms: Date.now() - started, ok: true,
      });
      return { ok: true, cached: true, data: hit, ...effect };
    }
  }

  /* ---- budget gate: degrade rather than fail ---- */
  let budget = null;
  try {
    budget = await assertBudget(hunter.id);
  } catch (e) {
    if (e.status !== 429 || !spec.fallback) throw e;
    const data = spec.fallback(payload);
    const effect = EFFECTS[action]
      ? await EFFECTS[action]({ hunter, data, meta, model: 'fallback', usage: { in: 0, out: 0 } })
      : {};
    return { ok: true, degraded: true, reason: e.message, data, ...effect };
  }

  /* ---- model call ---- */
  let result;
  try {
    result = await generate({
      system: spec.system(ctx),
      prompt: spec.prompt(payload),
      schema: spec.schema,
      tier: spec.tier,
      thinking: spec.thinking,
      maxTokens: spec.maxTokens,
    });
  } catch (err) {
    await logUsage({
      hunter_id: hunter.id, action, model: spec.tier, cached: false,
      latency_ms: Date.now() - started, ok: false, error: String(err.message).slice(0, 300),
    });
    if (!spec.fallback) throw err;
    const data = spec.fallback(payload);
    const effect = EFFECTS[action]
      ? await EFFECTS[action]({ hunter, data, meta, model: 'fallback', usage: { in: 0, out: 0 } })
      : {};
    return {
      ok: true, degraded: true,
      reason: 'The System is operating on reduced capacity.',
      data, ...effect,
    };
  }

  const effect = EFFECTS[action]
    ? await EFFECTS[action]({ hunter, data: result.data, meta, model: result.model, usage: result.usage })
    : {};

  if (key) await cacheSet(key, action, result.data, result.model, CACHE_TTL_MIN[action]);

  await logUsage({
    hunter_id: hunter.id, action, model: result.model, cached: false,
    tokens_in: result.usage.in, tokens_out: result.usage.out,
    latency_ms: Date.now() - started, ok: true,
  });

  return {
    ok: true,
    data: result.data,
    ...effect,
    usage: { ...result.usage, budget_used: budget?.used, budget_cap: budget?.cap },
  };
}
