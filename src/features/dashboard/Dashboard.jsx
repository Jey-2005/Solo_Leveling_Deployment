import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Swords, RefreshCw, AlertTriangle, Clock, Check, ChevronRight,
  Send, Target, Flame, ScrollText, Sparkles,
} from 'lucide-react'
import supabase from '../../config/supabase'
import { useSystem } from '../../context/SystemContext'
import { ai } from '../../lib/api'
import {
  Panel, PanelHeader, Button, Modal, Field, Input, Textarea,
  Chip, Empty, Loading, Bar, DegradedNote,
} from '../../components/system'
import { StatusWindow } from '../../components/system/StatusWindow'
import { STAT_MAP } from '../../data/system'
import { cn, todayKey, timeUntil, pct } from '../../lib/utils'

/* ==================================================================== *
 * Quest card
 * ==================================================================== */
function QuestCard({ quest, onOpen }) {
  const stat = STAT_MAP[quest.stat]
  const cleared = quest.state === 'CLEARED'
  const failed = quest.state === 'FAILED'
  const t = timeUntil(quest.expires_at)
  const urgent = t && !t.over && t.ms < 3 * 3600_000 && !cleared

  return (
    <button
      onClick={() => !cleared && !failed && onOpen(quest)}
      disabled={cleared || failed}
      className={cn(
        'group w-full text-left sys-panel p-4 transition-all',
        cleared && 'opacity-45',
        failed && 'opacity-40 border-danger/30',
        !cleared && !failed && 'hover:border-line-lit hover:bg-white/[0.025] cursor-pointer',
        quest.mandatory && !cleared && !failed && 'border-l-2 border-l-danger'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-8 h-8 grid place-items-center border"
             style={{
               borderColor: cleared ? '#34D39955' : `${stat?.color}44`,
               background: cleared ? '#34D39912' : `${stat?.color}0D`,
             }}>
          {cleared ? <Check size={14} className="text-jade" />
            : <span className="font-mono text-[9px] font-bold" style={{ color: stat?.color }}>{quest.stat}</span>}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className={cn('font-display text-[14px] leading-tight text-bone',
              cleared && 'line-through text-dim')}>
              {quest.title}
            </h3>
            <span className="shrink-0 sys-num text-[13px] text-gold">+{quest.xp_reward}</span>
          </div>

          <p className="text-[12.5px] text-ash mt-1.5 leading-snug">{quest.objective}</p>

          {quest.success_criteria && !cleared && (
            <p className="text-[11px] text-dim mt-1.5 leading-snug">
              <span className="font-mono text-[9px] tracking-[0.16em] text-mana mr-1.5">CLEAR IF</span>
              {quest.success_criteria}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            {quest.mandatory && <Chip tone="danger">Mandatory</Chip>}
            {quest.target_value != null && (
              <Chip tone="mana">{quest.target_value} {quest.target_unit}</Chip>
            )}
            <Chip>{'◆'.repeat(quest.difficulty)}</Chip>
            {quest.penalty_xp > 0 && !cleared && (
              <Chip tone="danger">−{quest.penalty_xp} on failure</Chip>
            )}
            {t && !cleared && !failed && (
              <Chip tone={urgent ? 'danger' : undefined}>
                <Clock size={9} className="inline mr-1 -mt-px" />
                {t.over ? 'expired' : t.label}
              </Chip>
            )}
          </div>
        </div>

        {!cleared && !failed && (
          <ChevronRight size={15} className="shrink-0 text-dim group-hover:text-mana transition-colors mt-1" />
        )}
      </div>
    </button>
  )
}

/* ==================================================================== *
 * Submission — the hunter reports, the System interrogates
 * ==================================================================== */
function SubmitModal({ quest, onClose, onDone }) {
  const [proof, setProof] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')

  async function submit() {
    if (proof.trim().length < 10) { setErr('Give the System something to actually judge.'); return }
    setBusy(true); setErr('')
    try {
      const r = await ai('validate_quest', {
        quest_id: quest.id,
        proof_text: proof.trim(),
        proof_value: value === '' ? null : Number(value),
      })
      setResult(r)
      if (r.verdict !== 'REJECTED') onDone?.()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const v = result?.verdict
  const tone = v === 'CLEARED' ? 'lit' : v === 'PARTIAL' ? 'lit' : v === 'REJECTED' ? 'danger' : 'lit'

  return (
    <Modal
      open
      onClose={onClose}
      tone={tone}
      eyebrow={result ? 'Judgement' : 'Report'}
      title={quest.title}
      footer={result ? (
        <>
          {v === 'REJECTED' && (
            <Button size="sm" onClick={() => { setResult(null); setErr('') }}>Try again</Button>
          )}
          <Button size="sm" variant="primary" onClick={onClose}>Close</Button>
        </>
      ) : (
        <>
          <Button size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" variant="primary" icon={Send} loading={busy} onClick={submit}>
            Submit for judgement
          </Button>
        </>
      )}
    >
      {!result ? (
        <div className="space-y-4">
          <div className="border-l-2 border-mana pl-3.5 py-1">
            <p className="text-[13px] text-ash leading-relaxed">{quest.objective}</p>
            {quest.success_criteria && (
              <p className="text-[12px] text-dim mt-2 leading-snug">{quest.success_criteria}</p>
            )}
          </div>

          {quest.target_value != null && (
            <Field label={`What did you actually reach? (${quest.target_unit || 'value'})`}
                   hint={`Target was ${quest.target_value} ${quest.target_unit || ''}.`}>
              <Input type="number" inputMode="decimal" step="any" value={value}
                     onChange={(e) => setValue(e.target.value)} placeholder={String(quest.target_value)} />
            </Field>
          )}

          <Field
            label="Report"
            hint="Specifics only. Vague reports get rejected, and inflated ones cost integrity."
          >
            <Textarea rows={5} value={proof} onChange={(e) => setProof(e.target.value)}
                      placeholder="What you did, when, for how long, and how it went." />
          </Field>

          {err && <p className="text-[12px] text-danger">{err}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <DegradedNote reason={result.degraded ? result.reason : null} />

          <div className={cn('text-center py-3 border',
            v === 'CLEARED' ? 'border-jade/40 bg-jade/[0.06]'
            : v === 'PARTIAL' ? 'border-gold/40 bg-gold/[0.06]'
            : 'border-danger/40 bg-danger/[0.06]')}>
            <p className={cn('font-display text-2xl font-bold uppercase tracking-[0.1em]',
              v === 'CLEARED' ? 'text-jade' : v === 'PARTIAL' ? 'text-gold' : 'text-danger')}>
              {v === 'CLEARED' ? 'Cleared' : v === 'PARTIAL' ? 'Partial' : 'Rejected'}
            </p>
            {result.xp_awarded > 0 && (
              <p className="sys-num text-lg text-gold mt-1">+{result.xp_awarded} XP</p>
            )}
            {result.data?.score != null && (
              <p className="font-mono text-[10px] text-dim mt-1.5 tracking-[0.2em]">
                SCORE {result.data.score}/100
              </p>
            )}
          </div>

          {result.data?.response && (
            <p className="text-[13.5px] text-bone leading-relaxed">{result.data.response}</p>
          )}
          {result.data?.followup && (
            <div className="border-l-2 border-monarch pl-3.5 py-1">
              <p className="font-mono text-[9px] text-monarch tracking-[0.2em] mb-1.5">FOLLOW-UP</p>
              <p className="text-[13px] text-ash leading-relaxed">{result.data.followup}</p>
            </div>
          )}
          {result.award?.level_up && (
            <p className="text-center font-display text-sm text-monarch anim-pulse">Level increased.</p>
          )}
        </div>
      )}
    </Modal>
  )
}

/* ==================================================================== *
 * Dashboard
 * ==================================================================== */
export default function Dashboard() {
  const { hunter, stats, progress, latestEval, reload, pushToast } = useSystem()

  const [quests, setQuests] = useState(null)
  const [penalties, setPenalties] = useState([])
  const [goals, setGoals] = useState([])
  const [active, setActive] = useState(null)
  const [rolling, setRolling] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [boardNote, setBoardNote] = useState('')

  const load = useCallback(async () => {
    const today = todayKey()
    const [q, p, g] = await Promise.all([
      supabase.from('quests').select('*').eq('quest_date', today)
        .order('mandatory', { ascending: false }).order('difficulty', { ascending: false }),
      supabase.from('penalties').select('*').eq('resolved', false).order('created_at', { ascending: false }),
      supabase.from('goals').select('*').eq('state', 'ACTIVE').order('priority').limit(5),
    ])
    setQuests(q.data || [])
    setPenalties(p.data || [])
    setGoals(g.data || [])
  }, [])

  useEffect(() => { load() }, [load])

  async function rollBoard() {
    setRolling(true)
    try {
      const r = await ai('generate_quests', { date: todayKey() })
      setBoardNote(r.board_note || r.data?.board_note || '')
      if (r.degraded) pushToast({ title: 'REDUCED CAPACITY', body: r.reason, severity: 'WARN' })
      await load()
    } catch (e) {
      pushToast({ title: 'BOARD UNAVAILABLE', body: e.message, severity: 'DANGER' })
    } finally {
      setRolling(false)
    }
  }

  async function runEvaluation() {
    setEvaluating(true)
    try {
      const r = await ai('evaluate', {})
      if (r.degraded) pushToast({ title: 'REDUCED CAPACITY', body: r.reason, severity: 'WARN' })
      else pushToast({ title: 'EVALUATION COMPLETE', body: r.data?.verdict_title, severity: 'REWARD' })
      await reload()
    } catch (e) {
      pushToast({ title: 'EVALUATION FAILED', body: e.message, severity: 'DANGER' })
    } finally {
      setEvaluating(false)
    }
  }

  async function resolvePenalty(id) {
    await supabase.from('penalties').update({ resolved: true }).eq('id', id)
    setPenalties((prev) => prev.filter((p) => p.id !== id))
    reload()
  }

  const { done, total, xpAvailable } = useMemo(() => {
    const list = quests || []
    return {
      done: list.filter((q) => q.state === 'CLEARED').length,
      total: list.length,
      xpAvailable: list.filter((q) => q.state === 'ACTIVE').reduce((a, q) => a + q.xp_reward, 0),
    }
  }, [quests])

  const evalDue = !hunter?.last_eval_at
    || (Date.now() - new Date(hunter.last_eval_at)) > 3 * 86400_000

  return (
    <div className="space-y-5">
      {/* penalties come first — they should be uncomfortable */}
      {penalties.length > 0 && (
        <Panel tone="danger" brackets className="anim-slide">
          <div className="p-4">
            <div className="sys-eyebrow !text-danger mb-3 flex items-center gap-2">
              <AlertTriangle size={12} /> Penalty active
            </div>
            <div className="space-y-2">
              {penalties.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-3 py-1.5">
                  <div className="min-w-0">
                    <p className="text-[13px] text-bone leading-snug">{p.reason}</p>
                    {p.xp_lost > 0 && (
                      <p className="sys-num text-[13px] text-danger mt-0.5">−{p.xp_lost} XP</p>
                    )}
                  </div>
                  <Button size="sm" onClick={() => resolvePenalty(p.id)}>Acknowledge</Button>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      )}

      <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
        {/* ---------------- quest board ---------------- */}
        <div className="space-y-5 min-w-0">
          <Panel brackets>
            <PanelHeader
              eyebrow={`Daily quests · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}`}
              title="Quest Board"
              right={
                <Button size="sm" icon={RefreshCw} loading={rolling} onClick={rollBoard}>
                  {total ? 'Reroll' : 'Issue'}
                </Button>
              }
            />

            {total > 0 && (
              <div className="px-5 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] text-dim tracking-[0.16em]">
                    {done} / {total} CLEARED
                  </span>
                  <span className="font-mono text-[10px] text-gold">{xpAvailable} XP ON THE BOARD</span>
                </div>
                <Bar value={done} max={total} tone={done === total ? 'jade' : 'mana'} />
              </div>
            )}

            {boardNote && (
              <p className="px-5 pb-4 text-[12.5px] text-monarch leading-relaxed border-l-2 border-monarch ml-5 mr-5 pl-3 -mt-1">
                {boardNote}
              </p>
            )}

            <div className="px-3 pb-3 space-y-2">
              {quests === null ? <Loading label="Reading the board" />
                : total === 0 ? (
                  <Empty
                    icon={ScrollText}
                    title="No quests issued"
                    hint="The System builds today's board from your goals and the last two weeks of activity."
                    action={<Button variant="primary" icon={Sparkles} loading={rolling} onClick={rollBoard}>Issue quests</Button>}
                  />
                ) : quests.map((q) => (
                  <QuestCard key={q.id} quest={q} onOpen={setActive} />
                ))}
            </div>
          </Panel>

          {/* goals */}
          {goals.length > 0 && (
            <Panel>
              <PanelHeader eyebrow="Objectives" title="What you said you wanted" />
              <div className="px-5 pb-5 space-y-3">
                {goals.map((g) => {
                  const has = g.metric_target != null && g.metric_start != null
                  const p = has ? pct(Math.abs((g.metric_start ?? 0)), Math.abs(g.metric_target || 1)) : null
                  return (
                    <div key={g.id}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[13px] text-bone leading-snug">{g.title}</p>
                        {g.deadline && (
                          <span className="shrink-0 font-mono text-[10px] text-dim">{g.deadline}</span>
                        )}
                      </div>
                      {has && <Bar value={p} max={100} tone="monarch" className="mt-2" />}
                    </div>
                  )
                })}
              </div>
            </Panel>
          )}
        </div>

        {/* ---------------- status column ---------------- */}
        <div className="space-y-5 lg:sticky lg:top-5">
          <StatusWindow hunter={hunter} stats={stats} progress={progress} latestEval={latestEval} />

          <Panel tone={evalDue ? 'monarch' : undefined}>
            <div className="p-4">
              <div className="sys-eyebrow mb-2">Evaluation</div>
              <p className="text-[12.5px] text-ash leading-relaxed">
                {evalDue
                  ? 'The System has not judged you recently. Evaluation sets your attribute multipliers and how hard tomorrow gets.'
                  : `Last evaluated ${new Date(hunter.last_eval_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. It runs automatically every few days.`}
              </p>
              <Button
                variant={evalDue ? 'monarch' : 'default'}
                size="sm" className="mt-3 w-full justify-center"
                icon={Swords} loading={evaluating} onClick={runEvaluation}
              >
                Request evaluation
              </Button>
            </div>
          </Panel>

          {hunter?.streak_days > 0 && (
            <Panel>
              <div className="p-4 flex items-center gap-3">
                <Flame size={20} className="text-gold shrink-0" />
                <div className="min-w-0">
                  <p className="sys-num text-xl text-gold leading-none">{hunter.streak_days}</p>
                  <p className="text-[11px] text-dim mt-1">
                    day streak · best {hunter.best_streak}
                  </p>
                </div>
              </div>
            </Panel>
          )}
        </div>
      </div>

      {active && (
        <SubmitModal
          quest={active}
          onClose={() => setActive(null)}
          onDone={() => { load(); reload() }}
        />
      )}
    </div>
  )
}
