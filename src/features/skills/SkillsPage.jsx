import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Plus, Trash2, BrainCircuit, Clock, Sparkles, Send, Lock, Check, X, Award,
} from 'lucide-react'
import supabase from '../../config/supabase'
import { useSystem } from '../../context/SystemContext'
import { ai } from '../../lib/api'
import {
  Panel, PanelHeader, Button, Field, Input, Select, Textarea, Chip,
  Empty, Loading, Modal, Bar, DegradedNote, useConfirm,
} from '../../components/system'
import { cn, todayKey, num, timeUntil } from '../../lib/utils'

const DOMAINS = ['Programming', 'Design', 'Language', 'Music', 'Writing',
                 'Mathematics', 'Business', 'Craft', 'Sport', 'General']

const LEVEL_NAMES = [
  '', 'Novice', 'Beginner', 'Advanced beginner', 'Competent', 'Proficient',
  'Skilled', 'Advanced', 'Expert', 'Authority', 'Master',
]

/* ==================================================================== *
 * The examination
 * ==================================================================== */
function ExamModal({ skill, onClose, onGraded }) {
  const { pushToast } = useSystem()
  const [phase, setPhase] = useState('intro')   // intro | exam | result
  const [target, setTarget] = useState(Math.min(10, skill.level + 1))
  const [assessment, setAssessment] = useState(null)
  const [answers, setAnswers] = useState({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [note, setNote] = useState('')

  async function begin() {
    setBusy(true)
    try {
      const r = await ai('skill_exam_generate', { skill_id: skill.id, target_level: Number(target) })
      setAssessment(r.assessment)
      setNote(r.examiner_note || r.data?.examiner_note || '')
      setPhase('exam')
      if (r.degraded) pushToast({ title: 'REDUCED CAPACITY', body: r.reason, severity: 'WARN' })
    } catch (e) {
      pushToast({ title: 'CANNOT EXAMINE', body: e.message, severity: 'DANGER' })
      onClose()
    } finally { setBusy(false) }
  }

  async function grade() {
    setBusy(true)
    try {
      const r = await ai('skill_exam_grade', {
        assessment_id: assessment.id,
        answers: assessment.questions.map((q) => ({ id: q.id, answer: answers[q.id] ?? '' })),
      })
      setResult(r)
      setPhase('result')
      onGraded?.()
    } catch (e) {
      pushToast({ title: 'GRADING FAILED', body: e.message, severity: 'DANGER' })
    } finally { setBusy(false) }
  }

  const answered = assessment
    ? assessment.questions.filter((q) => String(answers[q.id] ?? '').trim().length > 0).length : 0
  const allAnswered = assessment && answered === assessment.questions.length

  return (
    <Modal
      open wide onClose={phase === 'exam' && !busy ? undefined : onClose}
      tone={phase === 'result' ? (result?.passed ? 'monarch' : 'danger') : 'lit'}
      eyebrow={phase === 'result' ? 'Result' : 'Assessment'}
      title={skill.name}
      footer={
        phase === 'intro' ? (
          <>
            <Button size="sm" onClick={onClose} disabled={busy}>Not yet</Button>
            <Button size="sm" variant="primary" icon={Sparkles} loading={busy} onClick={begin}>
              Begin examination
            </Button>
          </>
        ) : phase === 'exam' ? (
          <>
            <Button size="sm" onClick={onClose} disabled={busy}>Abandon</Button>
            <Button size="sm" variant="primary" icon={Send} loading={busy}
                    disabled={!allAnswered} onClick={grade}>
              Submit ({answered}/{assessment?.questions.length})
            </Button>
          </>
        ) : (
          <Button size="sm" variant="primary" onClick={onClose}>Close</Button>
        )
      }
    >
      {phase === 'intro' && (
        <div className="space-y-4">
          <p className="text-[13.5px] text-ash leading-relaxed">
            The examiner reads your logged practice before it writes a single question. If your
            hours do not support the level you are claiming, it will say so and the questions will
            be aimed at exactly that gap.
          </p>

          <Field label="Level being claimed"
                 hint={`Currently level ${skill.level} — ${LEVEL_NAMES[skill.level]}.`}>
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              {Array.from({ length: 10 }, (_, i) => i + 1)
                .filter((n) => n > skill.level - 1)
                .map((n) => (
                  <option key={n} value={n}>{n} — {LEVEL_NAMES[n]}</option>
                ))}
            </Select>
          </Field>

          <div className="border border-danger/30 bg-danger/[0.05] p-3.5 space-y-1.5">
            <p className="font-display text-[11px] uppercase tracking-[0.14em] text-danger">Terms</p>
            <ul className="text-[12.5px] text-ash leading-relaxed space-y-1">
              <li>· Pass mark rises with the level claimed — up to 82%.</li>
              <li>· Failure locks the skill for 48 hours.</li>
              <li>· Answers inconsistent with your practice log are flagged.</li>
              <li>· There is no partial credit for restating the question.</li>
            </ul>
          </div>
        </div>
      )}

      {phase === 'exam' && assessment && (
        <div className="space-y-5">
          {note && (
            <p className="text-[13px] text-monarch leading-relaxed border-l-2 border-monarch pl-3.5 py-1">
              {note}
            </p>
          )}

          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-dim tracking-[0.16em]">
              PASS MARK {assessment.pass_mark}%
            </span>
            <span className="font-mono text-[10px] text-dim">{answered}/{assessment.questions.length}</span>
          </div>
          <Bar value={answered} max={assessment.questions.length} tone="mana" />

          {assessment.questions.map((q, i) => (
            <div key={q.id} className="border border-line p-4">
              <div className="flex items-start gap-3 mb-3">
                <span className="sys-num text-[13px] text-mana shrink-0">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] text-bone leading-relaxed">{q.prompt}</p>
                  <div className="flex gap-1.5 mt-2">
                    <Chip>{q.type.replace('_', ' ')}</Chip>
                    {q.weight > 1 && <Chip tone="gold">×{q.weight} weight</Chip>}
                  </div>
                </div>
              </div>

              {q.type === 'MCQ' && q.options?.length ? (
                <div className="space-y-1.5">
                  {q.options.map((o, k) => (
                    <button key={k} onClick={() => setAnswers({ ...answers, [q.id]: o })}
                      className={cn('w-full text-left px-3.5 py-2.5 border text-[13px] transition-all',
                        answers[q.id] === o
                          ? 'border-mana text-mana bg-mana/[0.08]'
                          : 'border-line text-ash hover:border-line-lit')}>
                      <span className="font-mono text-[10px] mr-2.5 opacity-60">
                        {String.fromCharCode(65 + k)}
                      </span>
                      {o}
                    </button>
                  ))}
                </div>
              ) : (
                <Textarea rows={q.type === 'SCENARIO' ? 5 : 3}
                          value={answers[q.id] ?? ''}
                          placeholder="Answer in your own words."
                          onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
              )}
            </div>
          ))}
        </div>
      )}

      {phase === 'result' && result && (
        <div className="space-y-4">
          <DegradedNote reason={result.degraded ? result.reason : null} />

          <div className={cn('text-center py-4 border',
            result.passed ? 'border-monarch/40 bg-monarch/[0.06]' : 'border-danger/40 bg-danger/[0.06]')}>
            <p className={cn('font-display text-2xl font-bold uppercase tracking-[0.1em]',
              result.passed ? 'text-monarch' : 'text-danger')}>
              {result.passed ? 'Passed' : 'Not passed'}
            </p>
            <p className="sys-num text-3xl mt-2" style={{ color: result.passed ? '#A78BFA' : '#FF3B5C' }}>
              {result.score}
              <span className="text-sm text-dim">/{result.pass_mark} needed</span>
            </p>
            {result.passed && (
              <p className="text-[13px] text-bone mt-2">
                {skill.name} is now level {result.new_level} — {LEVEL_NAMES[result.new_level]}.
              </p>
            )}
            {!result.passed && (
              <p className="text-[12px] text-dim mt-2">Locked for 48 hours.</p>
            )}
          </div>

          {result.data?.examiner_notes && (
            <p className="text-[13.5px] text-bone leading-relaxed">{result.data.examiner_notes}</p>
          )}

          {result.data?.integrity_flag && (
            <p className="text-[12.5px] text-gold leading-snug border-l-2 border-gold pl-3.5 py-1">
              {result.data.integrity_flag}
            </p>
          )}

          {result.data?.per_question?.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="sys-eyebrow">Per question</p>
              {result.data.per_question.map((p, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-line last:border-0">
                  <span className="sys-num text-[12px] shrink-0"
                        style={{ color: num(p.score) >= 70 ? '#34D399' : num(p.score) >= 40 ? '#F5C542' : '#FF3B5C' }}>
                    {p.score}
                  </span>
                  <p className="text-[12.5px] text-ash leading-snug">{p.note}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

/* ==================================================================== *
 * Skills page
 * ==================================================================== */
export default function SkillsPage() {
  const { reload, pushToast } = useSystem()
  const { confirm, confirmElement } = useConfirm()

  const [skills, setSkills] = useState(null)
  const [sessions, setSessions] = useState([])
  const [addOpen, setAddOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(null)
  const [exam, setExam] = useState(null)
  const [busy, setBusy] = useState(false)

  const [f, setF] = useState({ name: '', domain: 'Programming', description: '', target_level: 5, weekly_target_min: 180 })
  const [log, setLog] = useState({ minutes: 30, focus: '', what_built: '', difficulty: 3, session_date: todayKey() })

  const load = useCallback(async () => {
    const [s, ss] = await Promise.all([
      supabase.from('skills').select('*').eq('archived', false).order('created_at'),
      supabase.from('skill_sessions').select('*')
        .gte('session_date', new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10)),
    ])
    setSkills(s.data || []); setSessions(ss.data || [])
  }, [])

  useEffect(() => { load() }, [load])

  const weekMinutes = useMemo(() => {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    const m = {}
    sessions.filter((s) => s.session_date >= weekAgo)
      .forEach((s) => { m[s.skill_id] = (m[s.skill_id] || 0) + num(s.minutes) })
    return m
  }, [sessions])

  const totalMinutes = useMemo(() => {
    const m = {}
    sessions.forEach((s) => { m[s.skill_id] = (m[s.skill_id] || 0) + num(s.minutes) })
    return m
  }, [sessions])

  async function addSkill() {
    if (f.name.trim().length < 2) return
    setBusy(true)
    try {
      await supabase.from('skills').insert({
        name: f.name.trim(), domain: f.domain, description: f.description || null,
        target_level: Number(f.target_level), weekly_target_min: Number(f.weekly_target_min),
      })
      setAddOpen(false)
      setF({ name: '', domain: 'Programming', description: '', target_level: 5, weekly_target_min: 180 })
      load()
    } catch (e) {
      pushToast({ title: 'COULD NOT ADD', body: e.message, severity: 'DANGER' })
    } finally { setBusy(false) }
  }

  async function saveSession() {
    if (!logOpen || !log.minutes) return
    setBusy(true)
    try {
      // One call: records the session and derives the XP server-side.
      const { data, error } = await supabase.rpc('log_practice', {
        p_skill: logOpen.id,
        p_minutes: Number(log.minutes),
        p_focus: log.focus || null,
        p_what_built: log.what_built || null,
        p_difficulty: Number(log.difficulty),
        p_date: log.session_date,
      })
      if (error) throw error

      pushToast({
        title: 'PRACTICE LOGGED',
        body: data?.awarded ? `+${data.awarded} XP to INT` : `${log.minutes} minutes`,
        severity: 'OK',
      })
      setLogOpen(null)
      setLog({ minutes: 30, focus: '', what_built: '', difficulty: 3, session_date: todayKey() })
      await Promise.all([load(), reload()])
    } catch (e) {
      pushToast({ title: 'COULD NOT LOG', body: e.message, severity: 'DANGER' })
    } finally { setBusy(false) }
  }

  if (skills === null) return <Loading label="Loading skills" />

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="sys-eyebrow mb-1.5">Skills</div>
          <h1 className="font-display text-2xl text-bone leading-none">Intelligence</h1>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>Track a skill</Button>
      </div>

      {skills.length === 0 ? (
        <Panel brackets>
          <Empty icon={BrainCircuit} title="No skills tracked"
                 hint="Log practice as you do it. When you think you have advanced, sit the examination — the System will not take your word for it." />
        </Panel>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {skills.map((s) => {
            const week = weekMinutes[s.id] || 0
            const total = totalMinutes[s.id] || 0
            const lock = s.next_eligible_at ? timeUntil(s.next_eligible_at) : null
            const locked = lock && !lock.over
            return (
              <Panel key={s.id} brackets className="group">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-[15px] text-bone leading-tight truncate">{s.name}</h3>
                      <p className="text-[11px] text-dim mt-1">{s.domain}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="sys-num text-2xl" style={{ color: s.color || '#3EC6FF' }}>{s.level}</p>
                      <p className="font-mono text-[9px] text-dim">{LEVEL_NAMES[s.level]}</p>
                    </div>
                  </div>

                  {s.description && (
                    <p className="text-[12px] text-ash mt-2.5 leading-snug line-clamp-2">{s.description}</p>
                  )}

                  <div className="mt-4">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="font-mono text-[10px] text-dim tracking-[0.14em]">THIS WEEK</span>
                      <span className="font-mono text-[10px]">
                        <span className={week >= s.weekly_target_min ? 'text-jade' : 'text-bone'}>
                          {Math.round(week / 60 * 10) / 10}h
                        </span>
                        <span className="text-dim"> / {Math.round(s.weekly_target_min / 60 * 10) / 10}h</span>
                      </span>
                    </div>
                    <Bar value={week} max={s.weekly_target_min}
                         tone={week >= s.weekly_target_min ? 'jade' : 'mana'} />
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <span className="font-mono text-[10px] text-dim">
                      {Math.round(total / 60)}h in 28 days
                    </span>
                    <span className="font-mono text-[10px] text-dim">target LV {s.target_level}</span>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Button size="sm" icon={Clock} className="flex-1 justify-center"
                            onClick={() => setLogOpen(s)}>
                      Log practice
                    </Button>
                    <Button
                      size="sm"
                      variant={locked ? 'default' : 'monarch'}
                      icon={locked ? Lock : Award}
                      className="flex-1 justify-center"
                      disabled={locked || s.level >= 10}
                      onClick={() => setExam(s)}
                    >
                      {locked ? lock.label : s.level >= 10 ? 'Mastered' : 'Assess'}
                    </Button>
                  </div>

                  {s.last_assessed_at && (
                    <p className="font-mono text-[9px] text-dim mt-2.5">
                      LAST ASSESSED {new Date(s.last_assessed_at).toLocaleDateString('en-IN')}
                    </p>
                  )}

                  <button
                    onClick={async () => {
                      if (await confirm({ title: 'Stop tracking?', body: `${s.name} will be archived.` })) {
                        await supabase.from('skills').update({ archived: true }).eq('id', s.id); load()
                      }
                    }}
                    className="absolute top-3 right-3 p-1 text-dim opacity-0 group-hover:opacity-100 hover:text-danger transition-all"
                    aria-label="Archive skill">
                    <Trash2 size={13} />
                  </button>
                </div>
              </Panel>
            )
          })}
        </div>
      )}

      {/* --------- add skill --------- */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} eyebrow="Skills" title="Track a skill"
        footer={
          <>
            <Button size="sm" onClick={() => setAddOpen(false)} disabled={busy}>Cancel</Button>
            <Button size="sm" variant="primary" loading={busy}
                    disabled={f.name.trim().length < 2} onClick={addSkill}>Add</Button>
          </>
        }>
        <div className="space-y-4">
          <Field label="Skill">
            <Input autoFocus value={f.name} placeholder="Rust"
                   onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Domain">
            <Select value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })}>
              {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>
          <Field label="What does competence look like here?"
                 hint="The examiner uses this to decide what counts as knowing it.">
            <Textarea rows={3} value={f.description}
                      placeholder="Write and debug async services without reaching for a tutorial."
                      onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Target level">
              <Select value={f.target_level} onChange={(e) => setF({ ...f, target_level: e.target.value })}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n} — {LEVEL_NAMES[n]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Weekly practice (min)">
              <Input type="number" step="15" value={f.weekly_target_min}
                     onChange={(e) => setF({ ...f, weekly_target_min: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>

      {/* --------- log practice --------- */}
      <Modal open={!!logOpen} onClose={() => setLogOpen(null)}
             eyebrow="Practice" title={logOpen?.name || ''}
        footer={
          <>
            <Button size="sm" onClick={() => setLogOpen(null)} disabled={busy}>Cancel</Button>
            <Button size="sm" variant="primary" loading={busy} onClick={saveSession}>Log it</Button>
          </>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Minutes">
              <Input type="number" autoFocus value={log.minutes}
                     onChange={(e) => setLog({ ...log, minutes: e.target.value })} />
            </Field>
            <Field label="Date">
              <Input type="date" value={log.session_date} max={todayKey()}
                     onChange={(e) => setLog({ ...log, session_date: e.target.value })} />
            </Field>
          </div>

          <div className="flex gap-1.5">
            {[15, 30, 45, 60, 90, 120].map((m) => (
              <button key={m} onClick={() => setLog({ ...log, minutes: m })}
                className={cn('flex-1 py-1.5 border font-mono text-[11px] transition-all',
                  Number(log.minutes) === m ? 'border-mana text-mana bg-mana/10'
                    : 'border-line text-dim hover:border-line-lit')}>
                {m}
              </button>
            ))}
          </div>

          <Field label="Focus" hint="What specifically you worked on.">
            <Input value={log.focus} placeholder="Lifetimes and borrow checker"
                   onChange={(e) => setLog({ ...log, focus: e.target.value })} />
          </Field>

          <Field label="What came out of it" hint="The examiner reads this later.">
            <Textarea rows={3} value={log.what_built}
                      placeholder="Rewrote the parser to avoid clones; still fighting one lifetime error."
                      onChange={(e) => setLog({ ...log, what_built: e.target.value })} />
          </Field>

          <Field label="Difficulty" hint={['Trivial', 'Easy', 'Moderate', 'Hard', 'At my limit'][log.difficulty - 1]}>
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setLog({ ...log, difficulty: n })}
                  className={cn('py-2 border font-display text-[13px] transition-all',
                    log.difficulty === n ? 'border-mana text-mana bg-mana/10'
                      : 'border-line text-dim hover:border-line-lit')}>
                  {n}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Modal>

      {exam && (
        <ExamModal skill={exam} onClose={() => { setExam(null); load() }}
                   onGraded={() => { load(); reload() }} />
      )}
      {confirmElement}
    </div>
  )
}
