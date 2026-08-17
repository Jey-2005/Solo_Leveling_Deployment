import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Plus, Trash2, ListChecks, Check, Clock, Bell, Mail, Smartphone, CalendarClock,
} from 'lucide-react'
import supabase from '../../config/supabase'
import { useSystem } from '../../context/SystemContext'
import {
  Panel, PanelHeader, Button, Field, Input, Select, Textarea, Chip,
  Empty, Loading, Modal, Tabs, useConfirm,
} from '../../components/system'
import { STATS, STAT_MAP } from '../../data/system'
import { cn, todayKey, timeUntil } from '../../lib/utils'

const CATEGORIES = ['General', 'Work', 'Health', 'Finance', 'Learning', 'Home', 'Errand', 'Admin']

export default function TasksPage() {
  const { settings, reload, pushToast } = useSystem()
  const { confirm, confirmElement } = useConfirm()

  const [tasks, setTasks] = useState(null)
  const [goals, setGoals] = useState([])
  const [tab, setTab] = useState('open')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(null)

  const blank = {
    title: '', detail: '', category: 'General', priority: 2,
    estimate_min: '', due_at: '', stat: 'WIL', xp_reward: 10,
    goal_id: '', remind_email: false, remind_push: true, remind_before_min: 30,
  }
  const [f, setF] = useState(blank)

  const load = useCallback(async () => {
    const [t, g] = await Promise.all([
      supabase.from('tasks').select('*').order('completed')
        .order('due_at', { ascending: true, nullsFirst: false }).limit(300),
      supabase.from('goals').select('id,title').eq('state', 'ACTIVE'),
    ])
    setTasks(t.data || []); setGoals(g.data || [])
  }, [])

  useEffect(() => { load() }, [load])

  const { openTasks, doneTasks, overdue } = useMemo(() => {
    const list = tasks || []
    return {
      openTasks: list.filter((t) => !t.completed),
      doneTasks: list.filter((t) => t.completed),
      overdue: list.filter((t) => !t.completed && t.due_at && new Date(t.due_at) < new Date()),
    }
  }, [tasks])

  async function toggle(t) {
    const done = !t.completed

    // Optimistic flip so the checkbox feels instant.
    setTasks((prev) => prev.map((x) => (x.id === t.id
      ? { ...x, completed: done, completed_at: done ? new Date().toISOString() : null } : x)))

    // The server decides the reward and refuses to pay the same task twice,
    // so toggling a task on and off cannot be used to farm XP.
    const { data, error } = await supabase.rpc('complete_task', {
      p_task: t.id, p_done: done,
    })

    if (error) {
      setTasks((prev) => prev.map((x) => (x.id === t.id ? t : x)))
      pushToast({ title: 'COULD NOT UPDATE', body: error.message, severity: 'DANGER' })
      return
    }

    if (done) {
      pushToast({
        title: 'TASK CLEARED',
        body: data?.awarded ? `+${data.awarded} XP to ${t.stat}` : t.title,
        severity: 'OK',
      })
      reload()
    }
    load()
  }

  async function save() {
    if (f.title.trim().length < 2) return
    setBusy(true)
    try {
      const payload = {
        title: f.title.trim(),
        detail: f.detail || null,
        category: f.category,
        priority: Number(f.priority),
        estimate_min: f.estimate_min ? Number(f.estimate_min) : null,
        due_at: f.due_at ? new Date(f.due_at).toISOString() : null,
        stat: f.stat,
        xp_reward: Number(f.xp_reward),
        goal_id: f.goal_id || null,
        remind_email: !!f.remind_email,
        remind_push: !!f.remind_push,
        remind_before_min: Number(f.remind_before_min),
      }
      if (edit) await supabase.from('tasks').update(payload).eq('id', edit.id)
      else await supabase.from('tasks').insert(payload)

      setOpen(false); setEdit(null); setF(blank); load()
    } catch (e) {
      pushToast({ title: 'COULD NOT SAVE', body: e.message, severity: 'DANGER' })
    } finally { setBusy(false) }
  }

  function openEdit(t) {
    setEdit(t)
    setF({
      title: t.title, detail: t.detail || '', category: t.category || 'General',
      priority: t.priority, estimate_min: t.estimate_min || '',
      due_at: t.due_at ? new Date(t.due_at).toISOString().slice(0, 16) : '',
      stat: t.stat, xp_reward: t.xp_reward, goal_id: t.goal_id || '',
      remind_email: t.remind_email, remind_push: t.remind_push,
      remind_before_min: t.remind_before_min,
    })
    setOpen(true)
  }

  if (tasks === null) return <Loading label="Loading tasks" />

  const list = tab === 'open' ? openTasks : doneTasks

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="sys-eyebrow mb-1.5">Tasks</div>
          <h1 className="font-display text-2xl text-bone leading-none">Obligations</h1>
        </div>
        <Button variant="primary" icon={Plus}
                onClick={() => { setEdit(null); setF(blank); setOpen(true) }}>
          New task
        </Button>
      </div>

      {overdue.length > 0 && (
        <Panel tone="danger">
          <div className="p-4 flex items-center gap-3">
            <Clock size={17} className="text-danger shrink-0" />
            <p className="text-[13px] text-bone">
              {overdue.length} task{overdue.length === 1 ? ' is' : 's are'} past due.
            </p>
          </div>
        </Panel>
      )}

      {settings && !settings.email && (
        <Panel>
          <div className="p-4 flex items-start gap-3">
            <Mail size={15} className="text-gold shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-ash leading-snug">
              No email is set, so email reminders will not send. Add one in Settings.
            </p>
          </div>
        </Panel>
      )}

      <Tabs value={tab} onChange={setTab} tabs={[
        { key: 'open', label: 'Open', badge: openTasks.length },
        { key: 'done', label: 'Completed' },
      ]} />

      <Panel brackets>
        <div className="p-3">
          {list.length === 0 ? (
            <Empty icon={ListChecks}
                   title={tab === 'open' ? 'Nothing outstanding' : 'Nothing completed yet'}
                   hint={tab === 'open' ? 'Add what you owe yourself this week.' : undefined} />
          ) : (
            <div className="space-y-1.5">
              {list.map((t) => {
                const stat = STAT_MAP[t.stat]
                const due = timeUntil(t.due_at)
                const late = due?.over && !t.completed
                return (
                  <div key={t.id}
                    className={cn('group flex items-start gap-3 p-3 border transition-all',
                      t.completed ? 'border-line opacity-45'
                        : late ? 'border-danger/40 bg-danger/[0.04]'
                        : 'border-line hover:border-line-lit')}>
                    <button onClick={() => toggle(t)} aria-label="Toggle complete"
                      className={cn('shrink-0 w-5 h-5 border grid place-items-center transition-all mt-0.5',
                        t.completed ? 'border-jade bg-jade/15 text-jade'
                          : 'border-line-lit text-transparent hover:border-mana hover:text-mana/40')}>
                      <Check size={12} />
                    </button>

                    <button onClick={() => openEdit(t)} className="min-w-0 flex-1 text-left">
                      <p className={cn('text-[13.5px] leading-snug',
                        t.completed ? 'text-dim line-through' : 'text-bone')}>
                        {t.title}
                      </p>
                      {t.detail && (
                        <p className="text-[11.5px] text-dim mt-1 leading-snug line-clamp-2">{t.detail}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <Chip>{t.category}</Chip>
                        <span className="font-mono text-[9px] px-1.5 py-px border"
                              style={{ color: stat?.color, borderColor: `${stat?.color}40` }}>
                          {t.stat} +{t.xp_reward}
                        </span>
                        {t.priority === 1 && <Chip tone="danger">High</Chip>}
                        {due && (
                          <Chip tone={late ? 'danger' : undefined}>
                            <CalendarClock size={9} className="inline mr-1 -mt-px" />
                            {late ? `${due.label} late` : due.label}
                          </Chip>
                        )}
                        {(t.remind_email || t.remind_push) && !t.completed && (
                          <span className="flex items-center gap-1 text-dim">
                            {t.remind_email && <Mail size={10} />}
                            {t.remind_push && <Smartphone size={10} />}
                          </span>
                        )}
                      </div>
                    </button>

                    <button
                      onClick={async () => {
                        if (await confirm({ title: 'Delete task?', body: t.title })) {
                          await supabase.from('tasks').delete().eq('id', t.id); load()
                        }
                      }}
                      className="shrink-0 p-1 text-dim opacity-0 group-hover:opacity-100 hover:text-danger transition-all"
                      aria-label="Delete task">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Panel>

      <Modal open={open} onClose={() => { setOpen(false); setEdit(null) }} wide
        eyebrow={edit ? 'Edit task' : 'New task'} title={f.title || 'Untitled'}
        footer={
          <>
            <Button size="sm" onClick={() => { setOpen(false); setEdit(null) }} disabled={busy}>Cancel</Button>
            <Button size="sm" variant="primary" loading={busy}
                    disabled={f.title.trim().length < 2} onClick={save}>
              {edit ? 'Save changes' : 'Create'}
            </Button>
          </>
        }>
        <div className="space-y-4">
          <Field label="Task">
            <Input autoFocus value={f.title} placeholder="Finish the quarterly report"
                   onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>

          <Field label="Detail">
            <Textarea rows={2} value={f.detail} placeholder="Optional"
                      onChange={(e) => setF({ ...f, detail: e.target.value })} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
                <option value={1}>High</option>
                <option value={2}>Normal</option>
                <option value={3}>Low</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Due">
              <Input type="datetime-local" value={f.due_at}
                     onChange={(e) => setF({ ...f, due_at: e.target.value })} />
            </Field>
            <Field label="Estimate (min)">
              <Input type="number" value={f.estimate_min}
                     onChange={(e) => setF({ ...f, estimate_min: e.target.value })} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Attribute" hint="Which stat this feeds.">
              <Select value={f.stat} onChange={(e) => setF({ ...f, stat: e.target.value })}>
                {STATS.map((s) => <option key={s.key} value={s.key}>{s.key} — {s.name}</option>)}
              </Select>
            </Field>
            <Field label="XP" hint="5–40 is sensible for a task.">
              <Input type="number" min="1" max="60" value={f.xp_reward}
                     onChange={(e) => setF({ ...f, xp_reward: e.target.value })} />
            </Field>
          </div>

          {goals.length > 0 && (
            <Field label="Linked goal">
              <Select value={f.goal_id} onChange={(e) => setF({ ...f, goal_id: e.target.value })}>
                <option value="">None</option>
                {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </Select>
            </Field>
          )}

          <div className="border-t border-line pt-4">
            <p className="sys-eyebrow mb-3 flex items-center gap-2"><Bell size={11} /> Reminders</p>
            <div className="space-y-2.5">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={f.remind_push} className="accent-[#3EC6FF] w-4 h-4"
                       onChange={(e) => setF({ ...f, remind_push: e.target.checked })} />
                <Smartphone size={13} className="text-dim" />
                <span className="text-[13px] text-ash">Push to this device</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={f.remind_email} className="accent-[#3EC6FF] w-4 h-4"
                       onChange={(e) => setF({ ...f, remind_email: e.target.checked })} />
                <Mail size={13} className="text-dim" />
                <span className="text-[13px] text-ash">Email</span>
              </label>
            </div>

            {(f.remind_push || f.remind_email) && (
              <Field label="How long before" className="mt-3">
                <Select value={f.remind_before_min}
                        onChange={(e) => setF({ ...f, remind_before_min: e.target.value })}>
                  {[5, 10, 15, 30, 60, 120, 240, 1440].map((m) => (
                    <option key={m} value={m}>
                      {m >= 1440 ? '1 day' : m >= 60 ? `${m / 60} hour${m > 60 ? 's' : ''}` : `${m} minutes`}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {(f.remind_push || f.remind_email) && !f.due_at && (
              <p className="text-[11.5px] text-gold mt-2 leading-snug">
                A reminder needs a due time to fire from.
              </p>
            )}
          </div>
        </div>
      </Modal>
      {confirmElement}
    </div>
  )
}
