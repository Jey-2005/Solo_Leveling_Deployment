import { useEffect, useState, useCallback, useMemo } from 'react'
import { Plus, Trash2, Search, Dumbbell, Check, X } from 'lucide-react'
import { iconFor } from '../../../data/icons'
import supabase from '../../../config/supabase'
import { useSystem } from '../../../context/SystemContext'
import {
  Panel, PanelHeader, Button, Field, Input, Select, Textarea,
  Chip, Empty, Loading, Modal,
} from '../../../components/system'
import { STAT_MAP } from '../../../data/system'
import { cn, todayKey, num } from '../../../lib/utils'

/* ==================================================================== *
 * Set editor — only appears for modalities whose schema asks for it
 * ==================================================================== */
function SetEditor({ sets, onChange, exercises }) {
  const [q, setQ] = useState('')
  const [picking, setPicking] = useState(false)

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return exercises.slice(0, 40)
    return exercises.filter((e) =>
      e.name.toLowerCase().includes(t) || e.muscle_group.toLowerCase().includes(t)).slice(0, 40)
  }, [q, exercises])

  const addExercise = (ex) => {
    onChange([...sets, {
      key: crypto.randomUUID(),
      exercise_id: ex?.id ?? null,
      exercise_name: ex?.name || q.trim() || 'Exercise',
      rows: [{ reps: '', weight_kg: '', is_warmup: false }],
    }])
    setQ(''); setPicking(false)
  }

  const patch = (i, fn) => onChange(sets.map((s, j) => (j === i ? fn(s) : s)))

  const volume = sets.reduce((a, s) =>
    a + s.rows.reduce((b, r) => b + (r.is_warmup ? 0 : num(r.reps) * num(r.weight_kg)), 0), 0)

  return (
    <div className="space-y-3">
      {sets.map((s, i) => (
        <div key={s.key} className="border border-line">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line bg-white/[0.02]">
            <span className="font-display text-[12px] text-bone truncate">{s.exercise_name}</span>
            <button onClick={() => onChange(sets.filter((_, j) => j !== i))}
                    className="text-dim hover:text-danger transition-colors shrink-0 p-0.5"
                    aria-label="Remove exercise">
              <Trash2 size={13} />
            </button>
          </div>

          <div className="p-2.5 space-y-1.5">
            <div className="grid grid-cols-[24px_1fr_1fr_36px] gap-2 px-0.5">
              <span className="font-mono text-[9px] text-dim tracking-wider">#</span>
              <span className="font-mono text-[9px] text-dim tracking-wider">REPS</span>
              <span className="font-mono text-[9px] text-dim tracking-wider">KG</span>
              <span className="font-mono text-[9px] text-dim tracking-wider text-center">W</span>
            </div>

            {s.rows.map((r, k) => (
              <div key={k} className="grid grid-cols-[24px_1fr_1fr_36px] gap-2 items-center">
                <span className="sys-num text-[12px] text-dim text-center">{k + 1}</span>
                <Input type="number" inputMode="numeric" value={r.reps} placeholder="—"
                       className="!py-1.5 !text-[13px]"
                       onChange={(e) => patch(i, (x) => ({
                         ...x, rows: x.rows.map((y, m) => (m === k ? { ...y, reps: e.target.value } : y)),
                       }))} />
                <Input type="number" inputMode="decimal" step="0.5" value={r.weight_kg} placeholder="—"
                       className="!py-1.5 !text-[13px]"
                       onChange={(e) => patch(i, (x) => ({
                         ...x, rows: x.rows.map((y, m) => (m === k ? { ...y, weight_kg: e.target.value } : y)),
                       }))} />
                <button
                  onClick={() => patch(i, (x) => ({
                    ...x, rows: x.rows.map((y, m) => (m === k ? { ...y, is_warmup: !y.is_warmup } : y)),
                  }))}
                  title="Warm-up set — excluded from volume"
                  className={cn('h-8 grid place-items-center border transition-colors',
                    r.is_warmup ? 'border-gold/50 text-gold bg-gold/10' : 'border-line text-dim hover:text-ash')}>
                  <span className="font-mono text-[10px]">{r.is_warmup ? 'W' : '·'}</span>
                </button>
              </div>
            ))}

            <div className="flex gap-1.5 pt-1">
              <Button size="sm" icon={Plus}
                onClick={() => patch(i, (x) => ({
                  ...x,
                  rows: [...x.rows, { ...(x.rows[x.rows.length - 1] || { reps: '', weight_kg: '' }), is_warmup: false }],
                }))}>
                Set
              </Button>
              {s.rows.length > 1 && (
                <Button size="sm" onClick={() => patch(i, (x) => ({ ...x, rows: x.rows.slice(0, -1) }))}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}

      {picking ? (
        <div className="border border-mana/40 p-2.5 space-y-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} className="pl-9"
                   placeholder="Search exercises, or type your own" />
          </div>
          <div className="max-h-52 overflow-y-auto space-y-px">
            {filtered.map((ex) => (
              <button key={ex.id} onClick={() => addExercise(ex)}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-mana/[0.07] transition-colors">
                <span className="text-[13px] text-ash truncate">{ex.name}</span>
                <span className="font-mono text-[9px] text-dim shrink-0">{ex.muscle_group}</span>
              </button>
            ))}
            {q.trim() && !filtered.some((e) => e.name.toLowerCase() === q.trim().toLowerCase()) && (
              <button onClick={() => addExercise(null)}
                className="w-full px-2.5 py-2 text-left text-[13px] text-mana hover:bg-mana/[0.07]">
                Add “{q.trim()}”
              </button>
            )}
          </div>
          <Button size="sm" icon={X} onClick={() => { setPicking(false); setQ('') }}>Cancel</Button>
        </div>
      ) : (
        <Button size="sm" icon={Plus} onClick={() => setPicking(true)}>Add exercise</Button>
      )}

      {volume > 0 && (
        <p className="font-mono text-[10px] text-dim tracking-wider">
          WORKING VOLUME <span className="text-mana">{Math.round(volume).toLocaleString()} kg</span>
        </p>
      )}
    </div>
  )
}

/* ==================================================================== *
 * Dynamic field renderer — the schema in the DB drives the form
 * ==================================================================== */
function DynamicField({ field, value, onChange }) {
  if (field.type === 'select') {
    return (
      <Field label={field.label}>
        <Select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
      </Field>
    )
  }
  if (field.type === 'text') {
    return (
      <Field label={field.label}>
        <Input value={value ?? ''} placeholder={field.placeholder || ''}
               onChange={(e) => onChange(e.target.value)} />
      </Field>
    )
  }
  return (
    <Field label={field.unit ? `${field.label} (${field.unit})` : field.label}>
      <Input type="number" inputMode="decimal"
             step={field.step ?? 1} min={field.min} max={field.max}
             value={value ?? ''} placeholder={field.placeholder || ''}
             onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

/* ==================================================================== *
 * Logger
 * ==================================================================== */
export default function WorkoutLogger() {
  const { reload, pushToast } = useSystem()

  const [types, setTypes] = useState(null)
  const [exercises, setExercises] = useState([])
  const [recent, setRecent] = useState([])
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('ALL')

  const [type, setType] = useState(null)
  const [form, setForm] = useState({})
  const [sets, setSets] = useState([])
  const [meta, setMeta] = useState({ duration_min: '', intensity: 3, rpe: '', notes: '', session_date: todayKey() })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [t, e, r] = await Promise.all([
      supabase.from('workout_types').select('*').eq('active', true)
        .order('popularity', { ascending: false }),
      supabase.from('exercises').select('*').order('name'),
      supabase.from('workout_sessions').select('*, workout_types(name, icon, primary_stat)')
        .order('session_date', { ascending: false }).limit(12),
    ])
    setTypes(t.data || [])
    setExercises(e.data || [])
    setRecent(r.data || [])
  }, [])

  useEffect(() => { load() }, [load])

  const categories = useMemo(() => {
    if (!types) return []
    return ['ALL', ...Array.from(new Set(types.map((t) => t.category)))]
  }, [types])

  const visible = useMemo(() => {
    if (!types) return []
    return category === 'ALL' ? types : types.filter((t) => t.category === category)
  }, [types, category])

  function pick(t) {
    setType(t)
    setForm({})
    setSets([])
    setMeta({ duration_min: '', intensity: 3, rpe: '', notes: '', session_date: todayKey() })
    setOpen(true)
  }

  const needsSets = type?.fields?.some((f) => f.type === 'sets')

  /** MET × weight × hours — a decent estimate when duration is known. */
  const estCalories = useMemo(() => {
    const mins = num(meta.duration_min)
    if (!mins || !type) return null
    const met = num(type.met_base, 5) * (0.75 + 0.125 * num(meta.intensity, 3))
    return Math.round(met * 70 * (mins / 60))  // 70 kg reference; refined server-side later
  }, [meta.duration_min, meta.intensity, type])

  async function save() {
    if (!type) return
    setBusy(true)
    try {
      const volume = sets.reduce((a, s) =>
        a + s.rows.reduce((b, r) => b + (r.is_warmup ? 0 : num(r.reps) * num(r.weight_kg)), 0), 0)

      const { data: session, error } = await supabase.from('workout_sessions').insert({
        type_code: type.code,
        session_date: meta.session_date,
        duration_min: meta.duration_min ? Number(meta.duration_min) : null,
        intensity: Number(meta.intensity),
        rpe: meta.rpe ? Number(meta.rpe) : null,
        calories: estCalories,
        metrics: form,
        notes: meta.notes || null,
        total_volume_kg: volume || 0,
      }).select().single()
      if (error) throw error

      if (sets.length) {
        const rows = []
        sets.forEach((s) => s.rows.forEach((r, i) => rows.push({
          session_id: session.id,
          exercise_id: s.exercise_id,
          exercise_name: s.exercise_name,
          set_index: i + 1,
          reps: r.reps ? Number(r.reps) : null,
          weight_kg: r.weight_kg ? Number(r.weight_kg) : null,
          is_warmup: !!r.is_warmup,
        })))
        if (rows.length) await supabase.from('workout_sets').insert(rows)
      }

      // XP is computed in Postgres, not here — the client cannot inflate it.
      const { data: award, error: scoreErr } =
        await supabase.rpc('submit_workout', { p_session: session.id })
      if (scoreErr) throw scoreErr

      pushToast({
        title: 'SESSION LOGGED',
        body: award?.awarded ? `+${award.awarded} XP to ${type.primary_stat}` : type.name,
        severity: 'REWARD',
      })

      setOpen(false)
      await Promise.all([load(), reload()])
    } catch (e) {
      pushToast({ title: 'COULD NOT SAVE', body: e.message, severity: 'DANGER' })
    } finally {
      setBusy(false)
    }
  }

  async function remove(id) {
    await supabase.from('workout_sessions').delete().eq('id', id)
    load()
  }

  if (types === null) return <Loading label="Loading modalities" />

  return (
    <div className="space-y-5">
      <Panel brackets>
        <PanelHeader eyebrow={`${types.length} modalities`} title="Log training" />

        <div className="px-5 pb-3 flex gap-1.5 overflow-x-auto scrollbar-none">
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={cn('shrink-0 px-2.5 py-1 border font-mono text-[10px] uppercase tracking-[0.1em] transition-all',
                category === c ? 'border-mana text-mana bg-mana/10' : 'border-line text-dim hover:border-line-lit')}>
              {c === 'ALL' ? 'All' : c}
            </button>
          ))}
        </div>

        <div className="px-5 pb-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {visible.map((t) => {
            const Icon = iconFor(t.icon)
            const stat = STAT_MAP[t.primary_stat]
            return (
              <button key={t.code} onClick={() => pick(t)}
                className="group p-3 border border-line text-left hover:border-mana/50 hover:bg-mana/[0.04] transition-all">
                <div className="flex items-start justify-between gap-2">
                  <Icon size={17} style={{ color: stat?.color }} />
                  <span className="font-mono text-[8px] text-dim">{t.primary_stat}</span>
                </div>
                <p className="font-display text-[12px] text-bone mt-2.5 leading-tight">{t.name}</p>
                <p className="text-[10px] text-dim mt-1 leading-snug line-clamp-2">{t.blurb}</p>
              </button>
            )
          })}
        </div>
      </Panel>

      <Panel>
        <PanelHeader eyebrow="History" title="Recent sessions" />
        <div className="px-5 pb-5">
          {recent.length === 0 ? (
            <Empty icon={Dumbbell} title="Nothing logged yet"
                   hint="Pick a modality above. The System scores volume and consistency, not intentions." />
          ) : (
            <div className="divide-y divide-line">
              {recent.map((s) => {
                const Icon = iconFor(s.workout_types?.icon)
                const stat = STAT_MAP[s.workout_types?.primary_stat]
                return (
                  <div key={s.id} className="flex items-center gap-3 py-3 group">
                    <Icon size={16} style={{ color: stat?.color }} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-bone truncate">{s.workout_types?.name || s.type_code}</p>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1">
                        <span className="font-mono text-[10px] text-dim">{s.session_date}</span>
                        {s.duration_min && <span className="font-mono text-[10px] text-dim">{s.duration_min} min</span>}
                        {s.total_volume_kg > 0 && (
                          <span className="font-mono text-[10px] text-mana">
                            {Math.round(s.total_volume_kg).toLocaleString()} kg
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="sys-num text-[13px] text-gold shrink-0">+{s.xp_awarded}</span>
                    <button onClick={() => remove(s.id)}
                      className="shrink-0 p-1 text-dim opacity-0 group-hover:opacity-100 hover:text-danger transition-all"
                      aria-label="Delete session">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Panel>

      {/* ---------------- log modal ---------------- */}
      <Modal
        open={open && !!type}
        onClose={() => setOpen(false)}
        wide
        eyebrow={type?.category}
        title={type?.name || ''}
        footer={
          <>
            <Button size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button size="sm" variant="primary" icon={Check} loading={busy} onClick={save}>
              Log session
            </Button>
          </>
        }
      >
        {type && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date">
                <Input type="date" value={meta.session_date} max={todayKey()}
                       onChange={(e) => setMeta({ ...meta, session_date: e.target.value })} />
              </Field>
              <Field label="Duration (min)">
                <Input type="number" inputMode="numeric" value={meta.duration_min} placeholder="45"
                       onChange={(e) => setMeta({ ...meta, duration_min: e.target.value })} />
              </Field>
            </div>

            <Field label="Intensity" hint={['Very easy', 'Easy', 'Moderate', 'Hard', 'All out'][meta.intensity - 1]}>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setMeta({ ...meta, intensity: n })}
                    className={cn('py-2 border font-display text-[13px] transition-all',
                      meta.intensity === n
                        ? 'border-mana text-mana bg-mana/10'
                        : 'border-line text-dim hover:border-line-lit')}>
                    {n}
                  </button>
                ))}
              </div>
            </Field>

            {/* modality-specific fields, straight from the DB schema */}
            {(type.fields || []).filter((f) => f.type !== 'sets').length > 0 && (
              <div className="border-t border-line pt-4">
                <p className="sys-eyebrow mb-3">{type.name} details</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  {(type.fields || []).filter((f) => f.type !== 'sets').map((f) => (
                    <DynamicField key={f.key} field={f} value={form[f.key]}
                                  onChange={(v) => setForm({ ...form, [f.key]: v })} />
                  ))}
                </div>
              </div>
            )}

            {needsSets && (
              <div className="border-t border-line pt-4">
                <p className="sys-eyebrow mb-3">Exercises</p>
                <SetEditor sets={sets} onChange={setSets} exercises={exercises} />
              </div>
            )}

            <div className="border-t border-line pt-4 grid sm:grid-cols-2 gap-4">
              <Field label="RPE" hint="1–10, how hard it felt. Optional.">
                <Input type="number" min="1" max="10" value={meta.rpe}
                       onChange={(e) => setMeta({ ...meta, rpe: e.target.value })} />
              </Field>
              {estCalories && (
                <div>
                  <span className="sys-label">Estimated burn</span>
                  <p className="sys-num text-2xl text-gold mt-1">{estCalories}<span className="text-xs ml-1">kcal</span></p>
                  <p className="text-[10px] text-dim mt-1">
                    From MET {type.met_base} at a 70 kg reference. An estimate only.
                  </p>
                </div>
              )}
            </div>

            <Field label="Notes">
              <Textarea rows={2} value={meta.notes} placeholder="How it went."
                        onChange={(e) => setMeta({ ...meta, notes: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  )
}
