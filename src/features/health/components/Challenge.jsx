import { useEffect, useState, useCallback } from 'react'
import {
  Flame, Heart, Send, Sparkles, Swords, Trophy, Skull, Check, X, Plus,
} from 'lucide-react'
import supabase from '../../../config/supabase'
import { useSystem } from '../../../context/SystemContext'
import { ai } from '../../../lib/api'
import {
  Panel, PanelHeader, Button, Field, Input, Textarea, Select, Chip,
  Empty, Loading, Modal, Bar, DegradedNote, useConfirm,
} from '../../../components/system'
import { cn, todayKey, num } from '../../../lib/utils'

const STRICTNESS = [
  { v: 1, label: 'Encouraging',  hint: 'Generous with partial credit.' },
  { v: 2, label: 'Fair',         hint: 'Reasonable, but notices excuses.' },
  { v: 3, label: 'Strict',       hint: 'Vague reports do not pass.' },
  { v: 4, label: 'Harsh',        hint: 'Near-misses are failures.' },
  { v: 5, label: 'Merciless',    hint: 'Only unambiguous completion counts.' },
]

/* ==================================================================== *
 * Design a new challenge
 * ==================================================================== */
function DesignModal({ open, onClose, onCreated }) {
  const { pushToast } = useSystem()
  const [premise, setPremise] = useState('')
  const [days, setDays] = useState(100)
  const [strict, setStrict] = useState(3)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)

  async function design() {
    if (premise.trim().length < 12) return
    setBusy(true)
    try {
      const r = await ai('challenge_design', {
        premise: premise.trim(),
        total_days: Number(days),
        strictness: Number(strict),
      })
      setPreview(r)
      if (r.degraded) pushToast({ title: 'REDUCED CAPACITY', body: r.reason, severity: 'WARN' })
      onCreated?.()
    } catch (e) {
      pushToast({ title: 'COULD NOT DESIGN', body: e.message, severity: 'DANGER' })
    } finally { setBusy(false) }
  }

  return (
    <Modal
      open={open} onClose={onClose} wide tone="monarch"
      eyebrow="New challenge" title={preview ? (preview.data?.title || 'Charter') : 'Set the terms'}
      footer={preview ? (
        <Button size="sm" variant="monarch" onClick={onClose}>Begin</Button>
      ) : (
        <>
          <Button size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" variant="monarch" icon={Sparkles} loading={busy}
                  disabled={premise.trim().length < 12} onClick={design}>
            Draft the charter
          </Button>
        </>
      )}
    >
      {!preview ? (
        <div className="space-y-4">
          <Field
            label="What are you actually trying to do?"
            hint="Be concrete. The System writes the rules from this, and it will hold you to them."
          >
            <Textarea rows={4} value={premise} onChange={(e) => setPremise(e.target.value)}
                      placeholder="Wake at 5am, train before work, and stop eating after 9pm — I keep starting and quitting in week two." />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Length (days)">
              <Input type="number" min="3" max="365" value={days}
                     onChange={(e) => setDays(e.target.value)} />
            </Field>
            <Field label="Strictness" hint={STRICTNESS.find((s) => s.v === Number(strict))?.hint}>
              <Select value={strict} onChange={(e) => setStrict(e.target.value)}>
                {STRICTNESS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
              </Select>
            </Field>
          </div>

          <div className="flex gap-1.5">
            {[7, 21, 30, 75, 100].map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={cn('flex-1 py-1.5 border font-mono text-[11px] transition-all',
                  Number(days) === d ? 'border-monarch text-monarch bg-monarch/10'
                    : 'border-line text-dim hover:border-line-lit')}>
                {d}d
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <DegradedNote reason={preview.degraded ? preview.reason : null} />
          {preview.data?.opening_line && (
            <p className="text-[14px] text-bone leading-relaxed border-l-2 border-monarch pl-3.5 py-1">
              {preview.data.opening_line}
            </p>
          )}
          {preview.data?.rules?.length > 0 && (
            <div>
              <p className="sys-eyebrow mb-2.5">The rules</p>
              <div className="space-y-2">
                {preview.data.rules.map((r, i) => (
                  <div key={i} className="flex gap-2.5">
                    <span className="sys-num text-[11px] text-monarch shrink-0">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-[13px] text-bone leading-snug">{r.rule}</p>
                      {r.why && <p className="text-[11.5px] text-dim mt-0.5 leading-snug">{r.why}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {preview.data?.failure_terms && (
            <p className="text-[12.5px] text-danger leading-snug border-l-2 border-danger pl-3.5 py-1">
              {preview.data.failure_terms}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}

/* ==================================================================== *
 * Daily report
 * ==================================================================== */
function DayModal({ challenge, day, onClose, onDone }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')

  async function submit() {
    if (text.trim().length < 15) { setErr('Not enough to judge. Say what you actually did.'); return }
    setBusy(true); setErr('')
    try {
      const r = await ai('challenge_day', {
        challenge_id: challenge.id,
        day_index: day.day_index,
        report_text: text.trim(),
      })
      setResult(r)
      onDone?.()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const v = result?.verdict

  return (
    <Modal
      open onClose={onClose}
      tone={v === 'FAIL' ? 'danger' : 'monarch'}
      eyebrow={`Day ${day.day_index} of ${challenge.total_days}`}
      title={result ? 'Judgement' : challenge.title}
      footer={result
        ? <Button size="sm" variant="primary" onClick={onClose}>Close</Button>
        : (
          <>
            <Button size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button size="sm" variant="monarch" icon={Send} loading={busy} onClick={submit}>
              Submit report
            </Button>
          </>
        )}
    >
      {!result ? (
        <div className="space-y-4">
          {day.brief && (
            <p className="text-[13.5px] text-bone leading-relaxed border-l-2 border-monarch pl-3.5 py-1">
              {day.brief}
            </p>
          )}
          {day.requirements?.length > 0 && (
            <div>
              <p className="sys-eyebrow mb-2">Today's requirements</p>
              <div className="space-y-1.5">
                {day.requirements.map((r, i) => (
                  <div key={i} className="flex gap-2.5 items-start">
                    <span className="text-mana mt-0.5">▸</span>
                    <p className="text-[13px] text-ash leading-snug">{r}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Field label="Your report" hint="Specifics. What you did, what you skipped, and honestly why.">
            <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)}
                      placeholder="Woke at 5:10, trained 40 minutes, ate at 9:40 because of a work call." />
          </Field>
          {err && <p className="text-[12px] text-danger">{err}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <DegradedNote reason={result.degraded ? result.reason : null} />
          <div className={cn('text-center py-3 border',
            v === 'PASS' ? 'border-jade/40 bg-jade/[0.06]'
              : v === 'PARTIAL' ? 'border-gold/40 bg-gold/[0.06]'
              : 'border-danger/40 bg-danger/[0.06]')}>
            <p className={cn('font-display text-2xl font-bold uppercase tracking-[0.1em]',
              v === 'PASS' ? 'text-jade' : v === 'PARTIAL' ? 'text-gold' : 'text-danger')}>
              {v === 'PASS' ? 'Held' : v === 'PARTIAL' ? 'Partial' : 'Broken'}
            </p>
            {result.xp_awarded > 0 && <p className="sys-num text-lg text-gold mt-1">+{result.xp_awarded} XP</p>}
            <p className="font-mono text-[10px] text-dim mt-1.5 tracking-[0.2em]">
              {result.lives} {result.lives === 1 ? 'LIFE' : 'LIVES'} LEFT · STREAK {result.streak}
            </p>
          </div>

          {result.data?.response && (
            <p className="text-[13.5px] text-bone leading-relaxed">{result.data.response}</p>
          )}
          {result.data?.tomorrow_brief && !result.finished && !result.broken && (
            <div className="border-l-2 border-mana pl-3.5 py-1">
              <p className="font-mono text-[9px] text-mana tracking-[0.2em] mb-1.5">TOMORROW</p>
              <p className="text-[13px] text-ash leading-relaxed">{result.data.tomorrow_brief}</p>
            </div>
          )}
          {result.broken && (
            <p className="text-center font-display text-sm text-danger">
              Out of lives. The challenge has ended.
            </p>
          )}
          {result.finished && !result.broken && (
            <p className="text-center font-display text-sm text-gold">Challenge complete.</p>
          )}
        </div>
      )}
    </Modal>
  )
}

/* ==================================================================== *
 * Challenge page
 * ==================================================================== */
export default function Challenge() {
  const { reload } = useSystem()
  const { confirm, confirmElement } = useConfirm()

  const [challenges, setChallenges] = useState(null)
  const [today, setToday] = useState(null)
  const [designOpen, setDesignOpen] = useState(false)
  const [dayOpen, setDayOpen] = useState(false)
  const [history, setHistory] = useState([])

  const load = useCallback(async () => {
    const { data } = await supabase.from('challenges').select('*')
      .order('created_at', { ascending: false })
    setChallenges(data || [])

    const act = (data || []).find((c) => c.state === 'ACTIVE')
    if (act) {
      const [d, h] = await Promise.all([
        supabase.from('challenge_days').select('*')
          .eq('challenge_id', act.id).eq('day_index', act.current_day).maybeSingle(),
        supabase.from('challenge_days').select('*')
          .eq('challenge_id', act.id).neq('verdict', 'PENDING')
          .order('day_index', { ascending: false }).limit(14),
      ])
      setToday(d.data)
      setHistory(h.data || [])
    } else { setToday(null); setHistory([]) }
  }, [])

  useEffect(() => { load() }, [load])

  if (challenges === null) return <Loading label="Loading challenges" />

  const active = challenges.find((c) => c.state === 'ACTIVE')
  const past = challenges.filter((c) => c.state !== 'ACTIVE')
  const submittedToday = today?.verdict && today.verdict !== 'PENDING'

  return (
    <div className="space-y-5">
      {!active ? (
        <Panel brackets>
          <Empty
            icon={Swords}
            title="No active challenge"
            hint="Describe what you're trying to hold to. The System writes the rules, sets the daily requirements, and judges each day as it comes — nothing is fixed in advance."
            action={<Button variant="monarch" icon={Sparkles} onClick={() => setDesignOpen(true)}>Design a challenge</Button>}
          />
        </Panel>
      ) : (
        <div className="grid lg:grid-cols-[1fr_300px] gap-5 items-start">
          <div className="space-y-5 min-w-0">
            <Panel tone="monarch" brackets scan>
              <div className="p-5">
                <div className="sys-eyebrow !text-monarch mb-3">Active challenge</div>
                <h2 className="font-display text-xl text-bone leading-tight">{active.title}</h2>

                <div className="flex items-center gap-4 mt-4">
                  <div>
                    <p className="sys-num text-3xl text-monarch leading-none">
                      {active.current_day}
                      <span className="text-sm text-dim">/{active.total_days}</span>
                    </p>
                    <p className="font-mono text-[9px] text-dim mt-1.5 tracking-[0.18em]">DAY</p>
                  </div>
                  <div className="flex-1">
                    <Bar value={active.current_day - 1} max={active.total_days} tone="monarch" />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 mt-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Heart key={i} size={15}
                           className={i < active.lives ? 'text-danger' : 'text-line'}
                           fill={i < active.lives ? 'currentColor' : 'none'} />
                  ))}
                  <span className="font-mono text-[10px] text-dim ml-2">
                    {active.lives} {active.lives === 1 ? 'life' : 'lives'} remaining
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-px bg-line border border-line mt-5">
                  {[
                    ['Held', active.passes, '#34D399'],
                    ['Partial', active.partials, '#F5C542'],
                    ['Broken', active.fails, '#FF3B5C'],
                    ['Streak', active.current_streak, '#A78BFA'],
                  ].map(([label, v, c]) => (
                    <div key={label} className="bg-abyss px-2 py-2.5 text-center">
                      <div className="sys-eyebrow justify-center !text-[8px] mb-1">{label}</div>
                      <div className="sys-num text-lg" style={{ color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel brackets={!submittedToday} tone={submittedToday ? undefined : 'lit'}>
              <PanelHeader
                eyebrow={`Day ${active.current_day}`}
                title={submittedToday ? 'Reported' : "Today's requirements"}
                right={!submittedToday && today && (
                  <Button size="sm" variant="monarch" icon={Send} onClick={() => setDayOpen(true)}>
                    Report
                  </Button>
                )}
              />
              <div className="px-5 pb-5">
                {!today ? (
                  <p className="text-[13px] text-dim">
                    Tomorrow's brief appears once today has been judged.
                  </p>
                ) : submittedToday ? (
                  <div className="space-y-3">
                    <Chip tone={today.verdict === 'PASS' ? 'jade' : today.verdict === 'PARTIAL' ? 'gold' : 'danger'}>
                      {today.verdict === 'PASS' ? 'Held' : today.verdict === 'PARTIAL' ? 'Partial' : 'Broken'}
                      {today.score != null && ` · ${today.score}/100`}
                    </Chip>
                    {today.ai_response && (
                      <p className="text-[13px] text-ash leading-relaxed">{today.ai_response}</p>
                    )}
                  </div>
                ) : (
                  <>
                    {today.brief && (
                      <p className="text-[13.5px] text-bone leading-relaxed mb-3">{today.brief}</p>
                    )}
                    <div className="space-y-1.5">
                      {(today.requirements || []).map((r, i) => (
                        <div key={i} className="flex gap-2.5 items-start">
                          <span className="text-monarch mt-0.5">▸</span>
                          <p className="text-[13px] text-ash leading-snug">{r}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </Panel>

            {history.length > 0 && (
              <Panel>
                <PanelHeader eyebrow="Log" title="Recent days" />
                <div className="px-5 pb-5 divide-y divide-line">
                  {history.map((d) => (
                    <div key={d.id} className="flex items-start gap-3 py-2.5">
                      <span className="sys-num text-[13px] text-dim shrink-0 w-7">{d.day_index}</span>
                      <div className="min-w-0 flex-1">
                        {d.ai_response && (
                          <p className="text-[12.5px] text-ash leading-snug line-clamp-2">{d.ai_response}</p>
                        )}
                      </div>
                      <Chip tone={d.verdict === 'PASS' ? 'jade' : d.verdict === 'PARTIAL' ? 'gold' : 'danger'}>
                        {d.verdict === 'PASS' ? '✓' : d.verdict === 'PARTIAL' ? '~' : '✕'}
                      </Chip>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>

          <div className="space-y-5 lg:sticky lg:top-5">
            <Panel>
              <PanelHeader eyebrow="Charter" title="The rules" />
              <div className="px-5 pb-5 space-y-2.5">
                {(active.charter?.rules || []).map((r, i) => (
                  <div key={i} className="flex gap-2.5">
                    <span className="sys-num text-[11px] text-monarch shrink-0">{i + 1}</span>
                    <p className="text-[12.5px] text-ash leading-snug">{r.rule}</p>
                  </div>
                ))}
                {active.charter?.failure_terms && (
                  <p className="text-[11.5px] text-danger leading-snug border-l-2 border-danger pl-3 py-1 mt-3">
                    {active.charter.failure_terms}
                  </p>
                )}
              </div>
            </Panel>

            <Button
              variant="danger" size="sm" className="w-full justify-center"
              onClick={async () => {
                if (await confirm({
                  title: 'Abandon the challenge?',
                  body: 'It will be marked abandoned. This cannot be undone.',
                  confirmLabel: 'Abandon',
                })) {
                  await supabase.from('challenges').update({ state: 'ABANDONED' }).eq('id', active.id)
                  load(); reload()
                }
              }}
            >
              Abandon challenge
            </Button>
          </div>
        </div>
      )}

      {past.length > 0 && (
        <Panel>
          <PanelHeader
            eyebrow="Archive" title="Past challenges"
            right={!active && (
              <Button size="sm" icon={Plus} onClick={() => setDesignOpen(true)}>New</Button>
            )}
          />
          <div className="px-5 pb-5 divide-y divide-line">
            {past.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-3">
                {c.state === 'COMPLETED' ? <Trophy size={15} className="text-gold shrink-0" />
                  : <Skull size={15} className="text-dim shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-bone truncate">{c.title}</p>
                  <p className="font-mono text-[10px] text-dim mt-0.5">
                    {c.passes}✓ {c.partials}~ {c.fails}✕ · best streak {c.longest_streak}
                  </p>
                </div>
                <Chip tone={c.state === 'COMPLETED' ? 'gold' : undefined}>{c.state}</Chip>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <DesignModal open={designOpen} onClose={() => { setDesignOpen(false); load() }}
                   onCreated={load} />
      {dayOpen && active && today && (
        <DayModal challenge={active} day={today}
                  onClose={() => { setDayOpen(false); load() }}
                  onDone={() => { load(); reload() }} />
      )}
      {confirmElement}
    </div>
  )
}
