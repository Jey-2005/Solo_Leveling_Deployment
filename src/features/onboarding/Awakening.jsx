import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowLeft, Plus, Trash2, Check } from 'lucide-react'
import supabase from '../../config/supabase'
import { useSystem } from '../../context/SystemContext'
import { Panel, Button, Field, Input, Select, Textarea, Chip } from '../../components/system'
import { ACTIVITY_LEVELS, buildBodyReport } from '../../lib/formulas'
import { STATS } from '../../data/system'
import { ai } from '../../lib/api'
import { cn, todayKey } from '../../lib/utils'

const GOAL_DOMAINS = [
  { key: 'HEALTH',  label: 'Health',  stat: 'VIT' },
  { key: 'FITNESS', label: 'Fitness', stat: 'STR' },
  { key: 'FINANCE', label: 'Finance', stat: 'PER' },
  { key: 'SKILL',   label: 'Skill',   stat: 'INT' },
  { key: 'GENERAL', label: 'General', stat: 'WIL' },
]

const PRESETS = [
  { title: 'Reach a healthy body composition', domain: 'HEALTH', metric_name: 'Weight', metric_unit: 'kg' },
  { title: 'Train at least four times a week', domain: 'FITNESS', metric_name: 'Sessions/week', metric_unit: 'sessions' },
  { title: 'Save a fixed share of income every month', domain: 'FINANCE', metric_name: 'Savings rate', metric_unit: '%' },
  { title: 'Become genuinely good at one hard skill', domain: 'SKILL', metric_name: 'Hours', metric_unit: 'h' },
  { title: 'Stop breaking promises to myself', domain: 'GENERAL', metric_name: 'Streak', metric_unit: 'days' },
]

export default function Awakening() {
  const { hunter, reload } = useSystem()
  const nav = useNavigate()

  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const [id, setId] = useState({
    display_name: hunter?.display_name === 'Unnamed Hunter' ? '' : (hunter?.display_name || ''),
    birth_date: hunter?.birth_date || '',
    sex: hunter?.sex || '',
    height_cm: hunter?.height_cm || '',
    timezone: hunter?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
  })
  const [body, setBody] = useState({
    weight_kg: '', neck_cm: '', waist_cm: '', hip_cm: '', body_fat_pct: '',
    activity: 'MODERATE', goal: 'MAINTAIN',
  })
  const [goals, setGoals] = useState([])
  const [draft, setDraft] = useState({ title: '', domain: 'GENERAL', deadline: '' })

  const age = id.birth_date
    ? Math.floor((Date.now() - new Date(id.birth_date)) / 31557600000) : null

  const canNext =
    step === 0 ? id.display_name.trim().length >= 2 && id.sex && id.height_cm && id.birth_date
    : step === 1 ? !!body.weight_kg
    : goals.length > 0

  function addGoal(g) {
    if (goals.length >= 5) return
    setGoals((prev) => [...prev, {
      title: g.title,
      domain: g.domain,
      target_stat: GOAL_DOMAINS.find((d) => d.key === g.domain)?.stat || 'WIL',
      metric_name: g.metric_name || null,
      metric_unit: g.metric_unit || null,
      deadline: g.deadline || null,
      priority: Math.min(3, goals.length + 1),
    }])
  }

  async function finish() {
    setBusy(true); setErr('')
    try {
      const hid = hunter.id

      await supabase.from('hunters').update({
        display_name: id.display_name.trim(),
        birth_date: id.birth_date,
        sex: id.sex,
        height_cm: Number(id.height_cm),
        timezone: id.timezone,
        onboarded: true,
        awakened_at: new Date().toISOString(),
        last_active_date: todayKey(),
      }).eq('id', hid)

      // First measurement
      await supabase.from('body_metrics').insert({
        hunter_id: hid,
        measured_on: todayKey(),
        weight_kg: Number(body.weight_kg),
        neck_cm: body.neck_cm ? Number(body.neck_cm) : null,
        waist_cm: body.waist_cm ? Number(body.waist_cm) : null,
        hip_cm: body.hip_cm ? Number(body.hip_cm) : null,
        body_fat_pct: body.body_fat_pct ? Number(body.body_fat_pct) : null,
      })

      // Derive the opening nutrition targets from the measurements given.
      const report = buildBodyReport({
        sex: id.sex, age, heightCm: Number(id.height_cm),
        weightKg: Number(body.weight_kg),
        bodyFatPct: body.body_fat_pct ? Number(body.body_fat_pct) : undefined,
        neckCm: body.neck_cm ? Number(body.neck_cm) : undefined,
        waistCm: body.waist_cm ? Number(body.waist_cm) : undefined,
        hipCm: body.hip_cm ? Number(body.hip_cm) : undefined,
        activity: body.activity, goal: body.goal,
      })

      if (report.kcalTarget) {
        await supabase.from('nutrition_targets').upsert({
          hunter_id: hid,
          kcal: report.kcalTarget,
          protein_g: report.proteinTargetG,
          carb_g: report.carbTargetG,
          fat_g: report.fatTargetG,
          fibre_g: report.fibreTargetG,
          water_ml: report.waterMl,
          strategy: body.goal,
          auto_from_report: true,
        }, { onConflict: 'hunter_id' })
      }

      if (goals.length) {
        await supabase.from('goals').insert(goals.map((g) => ({ ...g, hunter_id: hid })))
      }

      // First quest board. If the model is unreachable the server falls back,
      // so this should not block the hunter from entering.
      try { await ai('generate_quests', { date: todayKey() }) } catch { /* non-fatal */ }

      await reload()
      nav('/', { replace: true })
    } catch (e) {
      setErr(e.message || 'Could not complete awakening.')
    } finally {
      setBusy(false)
    }
  }

  const STEPS = ['Identity', 'Body', 'Goals']

  return (
    <div className="min-h-dvh px-4 py-8 sm:py-12">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-7">
          <div className="sys-eyebrow justify-center mb-3">Awakening</div>
          <h1 className="font-display text-2xl font-bold uppercase tracking-[0.06em] text-bone">
            {step === 0 ? 'Who are you?' : step === 1 ? 'Current state' : 'What are you chasing?'}
          </h1>
        </div>

        {/* progress rail */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={cn('h-[3px] transition-colors',
                i < step ? 'bg-mana' : i === step ? 'bg-mana anim-pulse' : 'bg-line')} />
              <p className={cn('font-mono text-[9px] tracking-[0.18em] uppercase mt-2',
                i <= step ? 'text-mana' : 'text-dim')}>{s}</p>
            </div>
          ))}
        </div>

        <Panel tone="lit" brackets className="anim-open">
          <div className="p-6 space-y-5">

            {step === 0 && (
              <>
                <Field label="Name">
                  <Input value={id.display_name} placeholder="Sung Jinwoo"
                         onChange={(e) => setId({ ...id, display_name: e.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Date of birth" hint={age ? `${age} years old` : 'Used for BMR and body metrics.'}>
                    <Input type="date" value={id.birth_date} max={todayKey()}
                           onChange={(e) => setId({ ...id, birth_date: e.target.value })} />
                  </Field>
                  <Field label="Sex at birth" hint="Body-composition formulas differ.">
                    <Select value={id.sex} onChange={(e) => setId({ ...id, sex: e.target.value })}>
                      <option value="">Select…</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Prefer not to say</option>
                    </Select>
                  </Field>
                </div>
                <Field label="Height" hint="Centimetres.">
                  <Input type="number" inputMode="decimal" step="0.5" min="80" max="250"
                         value={id.height_cm} placeholder="175"
                         onChange={(e) => setId({ ...id, height_cm: e.target.value })} />
                </Field>
                {id.sex === 'OTHER' && (
                  <p className="text-[11px] text-gold leading-snug border-l-2 border-gold/50 pl-3">
                    Several formulas need a male/female parameter. Choosing not to say means body-fat
                    and BMR estimates will be unavailable — everything else still works.
                  </p>
                )}
              </>
            )}

            {step === 1 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Weight" hint="Kilograms.">
                    <Input type="number" inputMode="decimal" step="0.1" value={body.weight_kg}
                           placeholder="72.5" onChange={(e) => setBody({ ...body, weight_kg: e.target.value })} />
                  </Field>
                  <Field label="Body fat %" hint="Leave blank to estimate it.">
                    <Input type="number" inputMode="decimal" step="0.1" value={body.body_fat_pct}
                           placeholder="optional" onChange={(e) => setBody({ ...body, body_fat_pct: e.target.value })} />
                  </Field>
                </div>

                <div className="border-t border-line pt-4">
                  <p className="sys-eyebrow mb-3">Or measure with a tape</p>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Neck">
                      <Input type="number" step="0.1" value={body.neck_cm} placeholder="cm"
                             onChange={(e) => setBody({ ...body, neck_cm: e.target.value })} />
                    </Field>
                    <Field label="Waist">
                      <Input type="number" step="0.1" value={body.waist_cm} placeholder="cm"
                             onChange={(e) => setBody({ ...body, waist_cm: e.target.value })} />
                    </Field>
                    <Field label="Hip">
                      <Input type="number" step="0.1" value={body.hip_cm} placeholder="cm"
                             onChange={(e) => setBody({ ...body, hip_cm: e.target.value })}
                             disabled={id.sex === 'MALE'} />
                    </Field>
                  </div>
                  <p className="text-[11px] text-dim mt-2 leading-snug">
                    {id.sex === 'FEMALE'
                      ? 'Neck, waist and hip together give a body-fat estimate.'
                      : 'Neck and waist together give a body-fat estimate.'}
                  </p>
                </div>

                <Field label="Activity level">
                  <Select value={body.activity} onChange={(e) => setBody({ ...body, activity: e.target.value })}>
                    {ACTIVITY_LEVELS.map((a) => (
                      <option key={a.key} value={a.key}>{a.label} — {a.hint}</option>
                    ))}
                  </Select>
                </Field>

                <Field label="Direction">
                  <div className="grid grid-cols-4 gap-1.5">
                    {[['CUT', 'Lose fat'], ['RECOMP', 'Recomp'], ['MAINTAIN', 'Maintain'], ['BULK', 'Gain']].map(([k, l]) => (
                      <button key={k} type="button" onClick={() => setBody({ ...body, goal: k })}
                        className={cn('px-2 py-2.5 border font-display text-[10px] uppercase tracking-wide transition-all',
                          body.goal === k
                            ? 'border-mana text-mana bg-mana/10'
                            : 'border-line text-dim hover:border-line-lit')}>
                        {l}
                      </button>
                    ))}
                  </div>
                </Field>
              </>
            )}

            {step === 2 && (
              <>
                <p className="text-[13px] text-ash leading-relaxed">
                  Daily quests are generated from these. Be specific — vague goals produce vague quests.
                </p>

                <div className="space-y-2">
                  {goals.map((g, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 border border-line bg-white/[0.02]">
                      <span className="sys-num text-sm text-mana shrink-0 mt-px">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-bone leading-snug">{g.title}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <Chip>{g.domain}</Chip>
                          <Chip tone="mana">{g.target_stat}</Chip>
                          {g.deadline && <Chip>by {g.deadline}</Chip>}
                        </div>
                      </div>
                      <button onClick={() => setGoals(goals.filter((_, j) => j !== i))}
                              className="shrink-0 text-dim hover:text-danger transition-colors p-1"
                              aria-label="Remove goal">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                {goals.length < 5 && (
                  <div className="border border-line p-3.5 space-y-3">
                    <Field label="Add a goal">
                      <Textarea rows={2} value={draft.title} placeholder="Squat 100 kg for five reps by December"
                                onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Select value={draft.domain} onChange={(e) => setDraft({ ...draft, domain: e.target.value })}>
                        {GOAL_DOMAINS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                      </Select>
                      <Input type="date" value={draft.deadline} min={todayKey()}
                             onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} />
                    </div>
                    <Button size="sm" icon={Plus} disabled={draft.title.trim().length < 4}
                            onClick={() => { addGoal(draft); setDraft({ title: '', domain: 'GENERAL', deadline: '' }) }}>
                      Add
                    </Button>
                  </div>
                )}

                {goals.length === 0 && (
                  <div>
                    <p className="sys-eyebrow mb-2.5">Or start from one of these</p>
                    <div className="space-y-1.5">
                      {PRESETS.map((p) => (
                        <button key={p.title} onClick={() => addGoal(p)}
                          className="w-full text-left px-3.5 py-2.5 border border-line text-[13px] text-ash hover:border-mana/50 hover:text-bone hover:bg-mana/[0.04] transition-all">
                          {p.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {err && <p className="text-[12px] text-danger border-l-2 border-danger pl-3 py-1">{err}</p>}

            <div className="flex items-center gap-2 pt-2">
              {step > 0 && (
                <Button icon={ArrowLeft} onClick={() => setStep(step - 1)} disabled={busy}>Back</Button>
              )}
              <div className="flex-1" />
              {step < 2 ? (
                <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
                  Continue <ArrowRight size={14} />
                </Button>
              ) : (
                <Button variant="monarch" loading={busy} disabled={!canNext} onClick={finish}>
                  <Check size={14} /> Arise
                </Button>
              )}
            </div>
          </div>
        </Panel>

        {step === 1 && (
          <p className="text-[11px] text-dim mt-4 leading-relaxed px-1">
            These numbers feed population-level estimates, not a diagnosis. You can change any of them later,
            and the full report explains every formula it uses.
          </p>
        )}
      </div>
    </div>
  )
}
