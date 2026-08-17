import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Scale, Download, Sparkles, TrendingDown, TrendingUp, Minus, Info, Plus,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
} from 'recharts'
import supabase from '../../../config/supabase'
import { useSystem } from '../../../context/SystemContext'
import { ai } from '../../../lib/api'
import {
  Panel, PanelHeader, Button, Field, Input, Select, Chip,
  Empty, Loading, Modal, DegradedNote,
} from '../../../components/system'
import { buildBodyReport, ACTIVITY_LEVELS, DISCLAIMER } from '../../../lib/formulas'
import { downloadBodyReport } from '../../../lib/pdf'
import { cn, todayKey, num } from '../../../lib/utils'

function Metric({ label, value, unit, note, color = '#E9EFF8', wide }) {
  return (
    <div className={cn('bg-abyss px-3 py-3', wide && 'col-span-2')}>
      <div className="sys-eyebrow !text-[8px] mb-1.5">{label}</div>
      <div className="sys-num text-xl leading-none" style={{ color }}>
        {value ?? '—'}
        {unit && value != null && <span className="text-[11px] ml-1 text-dim">{unit}</span>}
      </div>
      {note && <p className="text-[10px] text-dim mt-1.5 leading-snug">{note}</p>}
    </div>
  )
}

export default function BodyReport() {
  const { hunter, reload, pushToast } = useSystem()

  const [history, setHistory] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [insight, setInsight] = useState(null)
  const [thinking, setThinking] = useState(false)
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const [activity, setActivity] = useState('MODERATE')
  const [goal, setGoal] = useState('MAINTAIN')
  const [asianCutoffs, setAsianCutoffs] = useState(true)

  const [form, setForm] = useState({
    measured_on: todayKey(), weight_kg: '', body_fat_pct: '',
    neck_cm: '', waist_cm: '', hip_cm: '', chest_cm: '', arm_cm: '', thigh_cm: '',
    resting_hr: '', sleep_hours: '', note: '',
  })

  const load = useCallback(async () => {
    const { data } = await supabase.from('body_metrics').select('*')
      .order('measured_on', { ascending: false }).limit(90)
    setHistory(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  const latest = history?.[0]
  const age = hunter?.birth_date
    ? Math.floor((Date.now() - new Date(hunter.birth_date)) / 31557600000) : null

  const report = useMemo(() => {
    if (!latest?.weight_kg || !hunter?.height_cm || !age || !hunter?.sex) return null
    return buildBodyReport({
      sex: hunter.sex, age, heightCm: num(hunter.height_cm),
      weightKg: num(latest.weight_kg),
      bodyFatPct: latest.body_fat_pct ? num(latest.body_fat_pct) : undefined,
      neckCm: latest.neck_cm ? num(latest.neck_cm) : undefined,
      waistCm: latest.waist_cm ? num(latest.waist_cm) : undefined,
      hipCm: latest.hip_cm ? num(latest.hip_cm) : undefined,
      activity, goal, useAsianCutoffs: asianCutoffs,
    })
  }, [latest, hunter, age, activity, goal, asianCutoffs])

  const chart = useMemo(() => {
    if (!history) return []
    return [...history].reverse().map((h) => ({
      date: h.measured_on.slice(5),
      weight: h.weight_kg ? num(h.weight_kg) : null,
      bf: h.body_fat_pct ? num(h.body_fat_pct) : null,
      waist: h.waist_cm ? num(h.waist_cm) : null,
    }))
  }, [history])

  const delta = useMemo(() => {
    if (!history || history.length < 2) return null
    const now = num(history[0].weight_kg)
    const then = num(history[history.length - 1].weight_kg)
    if (!now || !then) return null
    return Math.round((now - then) * 10) / 10
  }, [history])

  async function save() {
    if (!form.weight_kg) return
    setBusy(true)
    try {
      const row = { hunter_id: hunter.id, measured_on: form.measured_on }
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'measured_on' || k === 'note') return
        if (v !== '') row[k] = Number(v)
      })
      if (form.note) row.note = form.note

      const { error } = await supabase.from('body_metrics').upsert(row, {
        onConflict: 'hunter_id,measured_on', ignoreDuplicates: false,
      })
      if (error) {
        // The table has no unique constraint on (hunter, date); fall back to insert.
        await supabase.from('body_metrics').insert(row)
      }

      pushToast({ title: 'MEASUREMENT RECORDED', severity: 'OK' })
      setOpen(false)
      setForm((f) => ({ ...f, note: '' }))
      await Promise.all([load(), reload()])
    } catch (e) {
      pushToast({ title: 'COULD NOT SAVE', body: e.message, severity: 'DANGER' })
    } finally { setBusy(false) }
  }

  async function generateInsight() {
    if (!report) return
    setThinking(true)
    try {
      const { data: saved } = await supabase.from('body_reports').insert({
        hunter_id: hunter.id,
        generated_on: todayKey(),
        inputs: report.inputs,
        computed: report,
      }).select().single()

      const r = await ai('body_insight', {
        computed: {
          bmi: report.bmi, bmi_band: report.bmiBand,
          body_fat_pct: report.bodyFatPct, body_fat_band: report.bodyFatBand,
          lean_mass_kg: report.leanMassKg, fat_mass_kg: report.fatMassKg,
          bmr: report.bmr, tdee: report.tdee,
          whtr: report.whtr, whtr_band: report.whtrBand,
          ffmi: report.ffmi?.normalised, ffmi_band: report.ffmi?.band,
          kcal_target: report.kcalTarget, protein_target_g: report.proteinTargetG,
        },
        goal,
        report_id: saved?.id,
      })
      setInsight(r)
      if (r.degraded) pushToast({ title: 'REDUCED CAPACITY', body: r.reason, severity: 'WARN' })
    } catch (e) {
      pushToast({ title: 'UNAVAILABLE', body: e.message, severity: 'DANGER' })
    } finally { setThinking(false) }
  }

  async function download() {
    if (!report) return
    try {
      await downloadBodyReport(report, hunter, insight?.data)
    } catch (e) {
      pushToast({ title: 'DOWNLOAD FAILED', body: e.message, severity: 'DANGER' })
    }
  }

  if (history === null) return <Loading label="Loading measurements" />

  const missing = !hunter?.height_cm || !age || !hunter?.sex

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Record measurement</Button>
        {report && (
          <>
            <Button icon={Sparkles} loading={thinking} onClick={generateInsight}>
              {insight ? 'Re-read' : 'Ask the System'}
            </Button>
            <Button icon={Download} onClick={download}>Download report</Button>
          </>
        )}
      </div>

      {missing && (
        <Panel tone="danger">
          <div className="p-4">
            <p className="text-[13px] text-bone leading-relaxed">
              Height, date of birth and sex are needed before any of the body maths can run.
              Add them in Settings.
            </p>
          </div>
        </Panel>
      )}

      {!latest && !missing && (
        <Panel brackets>
          <Empty icon={Scale} title="No measurements yet"
                 hint="Record weight — plus neck and waist if you have a tape measure — and the full analysis appears here."
                 action={<Button variant="primary" onClick={() => setOpen(true)}>Record the first one</Button>} />
        </Panel>
      )}

      {report && (
        <>
          <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
            <div className="space-y-5 min-w-0">
              <Panel brackets>
                <PanelHeader
                  eyebrow={`Measured ${latest.measured_on}`}
                  title="Composition"
                  right={
                    <button onClick={() => setShowDisclaimer(true)}
                            className="p-1.5 text-dim hover:text-mana transition-colors"
                            aria-label="About these numbers">
                      <Info size={15} />
                    </button>
                  }
                />
                <div className="px-5 pb-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-line border border-line">
                    <Metric label="Weight" value={num(latest.weight_kg)} unit="kg" color="#3EC6FF"
                            note={delta != null ? `${delta > 0 ? '+' : ''}${delta} kg since first entry` : null} />
                    <Metric label="BMI" value={report.bmi} note={report.bmiBand} color="#3EC6FF" />
                    <Metric label="Body fat" value={report.bodyFatPct} unit="%" color="#A78BFA"
                            note={report.bodyFatBand} />
                    <Metric label="Lean mass" value={report.leanMassKg} unit="kg" color="#34D399" />
                    <Metric label="Fat mass" value={report.fatMassKg} unit="kg" color="#FF3B5C" />
                    <Metric label="Waist / height" value={report.whtr} color="#F5C542"
                            note={report.whtrBand} />
                  </div>

                  {report.bodyFatSource && (
                    <p className="text-[11px] text-dim mt-3 leading-snug">
                      Body fat via {report.bodyFatSource}. BMI classified against {report.bmiStandard}.
                      <button onClick={() => setAsianCutoffs(!asianCutoffs)}
                              className="ml-2 text-mana hover:underline">
                        Use {asianCutoffs ? 'international' : 'Asian'} cut-offs
                      </button>
                    </p>
                  )}
                </div>
              </Panel>

              <Panel>
                <PanelHeader eyebrow="Energy" title="Requirements" />
                <div className="px-5 pb-5">
                  <div className="grid grid-cols-3 gap-px bg-line border border-line mb-4">
                    <Metric label="BMR" value={report.bmr} unit="kcal" color="#F5C542"
                            note={report.bmrMethod} />
                    <Metric label="TDEE" value={report.tdee} unit="kcal" color="#F5C542"
                            note={`×${report.activityFactor}`} />
                    <Metric label="Target" value={report.kcalTarget} unit="kcal" color="#3EC6FF"
                            note={goal} />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Activity level">
                      <Select value={activity} onChange={(e) => setActivity(e.target.value)}>
                        {ACTIVITY_LEVELS.map((a) => (
                          <option key={a.key} value={a.key}>{a.label}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Direction">
                      <Select value={goal} onChange={(e) => setGoal(e.target.value)}>
                        <option value="CUT">Cut — lose fat</option>
                        <option value="RECOMP">Recomp</option>
                        <option value="MAINTAIN">Maintain</option>
                        <option value="BULK">Bulk — gain</option>
                      </Select>
                    </Field>
                  </div>

                  {report.projection && (
                    <p className="text-[12.5px] text-ash leading-relaxed mt-4 border-l-2 border-mana pl-3.5 py-1">
                      At a {report.projection.dailyDeficit} kcal daily deficit, reaching the top of the
                      healthy BMI range means losing {report.projection.kgToLose} kg — around{' '}
                      {report.projection.weeks} weeks of consistent adherence. Progress is rarely linear.
                    </p>
                  )}
                </div>
              </Panel>

              {chart.length > 1 && (
                <Panel>
                  <PanelHeader eyebrow="Trend" title="Over time" />
                  <div className="px-3 pb-5 h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chart} margin={{ top: 6, right: 12, left: -14, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="2 6" vertical={false} />
                        <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
                        <YAxis tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} />
                        <Tooltip
                          contentStyle={{
                            background: '#0A0E1A', border: '1px solid #1E2739',
                            borderRadius: 2, fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
                          }}
                          labelStyle={{ color: '#5C6880' }}
                        />
                        <Line type="monotone" dataKey="weight" stroke="#3EC6FF" strokeWidth={2}
                              dot={false} connectNulls name="Weight (kg)" />
                        <Line type="monotone" dataKey="bf" stroke="#A78BFA" strokeWidth={1.5}
                              dot={false} connectNulls name="Body fat (%)" />
                        <Line type="monotone" dataKey="waist" stroke="#F5C542" strokeWidth={1.5}
                              strokeDasharray="4 4" dot={false} connectNulls name="Waist (cm)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
              )}
            </div>

            {/* --------- side --------- */}
            <div className="space-y-5 lg:sticky lg:top-5">
              {insight?.data && (
                <Panel tone="monarch" brackets>
                  <div className="p-4 space-y-3">
                    <div className="sys-eyebrow !text-monarch">The System's reading</div>
                    <DegradedNote reason={insight.degraded ? insight.reason : null} />
                    {insight.data.standout && (
                      <p className="font-display text-[13px] text-monarch uppercase tracking-wide leading-snug">
                        {insight.data.standout}
                      </p>
                    )}
                    <p className="text-[13px] text-bone leading-relaxed">{insight.data.summary}</p>
                    {insight.data.actions?.length > 0 && (
                      <div className="space-y-2 pt-1">
                        {insight.data.actions.map((a, i) => (
                          <div key={i} className="flex gap-2.5">
                            <span className="sys-num text-[11px] text-monarch shrink-0">{i + 1}</span>
                            <p className="text-[12.5px] text-ash leading-snug">{a}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {insight.data.risk_notes && (
                      <p className="text-[11.5px] text-gold leading-snug border-l-2 border-gold/50 pl-3 py-1">
                        {insight.data.risk_notes}
                      </p>
                    )}
                  </div>
                </Panel>
              )}

              {report.ffmi && (
                <Panel>
                  <PanelHeader eyebrow="Potential" title="Muscular development" />
                  <div className="px-5 pb-5">
                    <div className="grid grid-cols-2 gap-px bg-line border border-line">
                      <Metric label="FFMI" value={report.ffmi.normalised} color="#A78BFA"
                              note={report.ffmi.band} />
                      <Metric label="Of ceiling" value={report.ffmi.pctOfCeiling} unit="%"
                              color="#F5C542" note={`ceiling ≈ ${report.ffmi.ceiling}`} />
                    </div>
                    <p className="text-[11px] text-dim mt-3 leading-snug">
                      Fat-free mass index normalised to 1.80 m. A reference point, not a limit.
                    </p>
                  </div>
                </Panel>
              )}

              <Panel>
                <PanelHeader eyebrow="Reference" title="Weight ranges" />
                <div className="px-5 pb-5 space-y-2">
                  {[
                    ['Healthy BMI', report.ideal?.bmiRange ? `${report.ideal.bmiRange[0]} – ${report.ideal.bmiRange[1]} kg` : '—'],
                    ['Devine', report.ideal?.devine ? `${report.ideal.devine} kg` : '—'],
                    ['Robinson', report.ideal?.robinson ? `${report.ideal.robinson} kg` : '—'],
                    ['Miller', report.ideal?.miller ? `${report.ideal.miller} kg` : '—'],
                    ['Metabolic age', report.metabolicAge
                      ? `${report.metabolicAge.value} y (${report.metabolicAge.delta > 0 ? '+' : ''}${report.metabolicAge.delta})` : '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-3 py-1.5 border-b border-line last:border-0">
                      <span className="text-[12px] text-dim">{k}</span>
                      <span className="font-mono text-[12px] text-bone">{v}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}

      {/* ---------------- record modal ---------------- */}
      <Modal
        open={open} onClose={() => setOpen(false)} wide
        eyebrow="Body" title="Record measurement"
        footer={
          <>
            <Button size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button size="sm" variant="primary" loading={busy} disabled={!form.weight_kg} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date">
              <Input type="date" value={form.measured_on} max={todayKey()}
                     onChange={(e) => setForm({ ...form, measured_on: e.target.value })} />
            </Field>
            <Field label="Weight (kg)">
              <Input type="number" step="0.1" autoFocus value={form.weight_kg}
                     onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} />
            </Field>
          </div>

          <div className="border-t border-line pt-4">
            <p className="sys-eyebrow mb-3">Circumference (cm)</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                ['neck_cm', 'Neck'], ['waist_cm', 'Waist'], ['hip_cm', 'Hip'],
                ['chest_cm', 'Chest'], ['arm_cm', 'Arm'], ['thigh_cm', 'Thigh'],
              ].map(([k, label]) => (
                <Field key={k} label={label}>
                  <Input type="number" step="0.1" value={form[k]}
                         onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                </Field>
              ))}
            </div>
            <p className="text-[11px] text-dim mt-2 leading-snug">
              Neck and waist{hunter?.sex === 'FEMALE' ? ' and hip' : ''} are what the body-fat estimate needs.
            </p>
          </div>

          <div className="border-t border-line pt-4 grid grid-cols-3 gap-3">
            <Field label="Body fat %" hint="If measured.">
              <Input type="number" step="0.1" value={form.body_fat_pct}
                     onChange={(e) => setForm({ ...form, body_fat_pct: e.target.value })} />
            </Field>
            <Field label="Resting HR">
              <Input type="number" value={form.resting_hr}
                     onChange={(e) => setForm({ ...form, resting_hr: e.target.value })} />
            </Field>
            <Field label="Sleep (h)">
              <Input type="number" step="0.5" value={form.sleep_hours}
                     onChange={(e) => setForm({ ...form, sleep_hours: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>

      <Modal open={showDisclaimer} onClose={() => setShowDisclaimer(false)}
             eyebrow="Important" title="About these numbers" tone="danger"
             footer={<Button size="sm" variant="primary" onClick={() => setShowDisclaimer(false)}>Understood</Button>}>
        <p className="text-[13px] text-ash leading-relaxed">{DISCLAIMER}</p>
      </Modal>
    </div>
  )
}
