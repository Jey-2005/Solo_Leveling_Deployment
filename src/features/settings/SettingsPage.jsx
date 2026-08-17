import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Save, Bell, Mail, Smartphone, Cpu, User, LogOut, Download, Volume2, Moon,
} from 'lucide-react'
import supabase from '../../config/supabase'
import { useAuth, useSystem } from '../../context/SystemContext'
import {
  Panel, PanelHeader, Button, Field, Input, Select, Chip, Loading, useConfirm,
} from '../../components/system'
import { enablePush, disablePush, pushSupported } from '../../lib/notifications'
import { cn, num } from '../../lib/utils'

const VOICES = [
  { key: 'STRICT',   label: 'Strict',   hint: 'Cold, exacting, no flattery. The default.' },
  { key: 'MEASURED', label: 'Measured', hint: 'Direct but even-handed.' },
  { key: 'BRUTAL',   label: 'Brutal',   hint: 'Blunt to the point of discomfort.' },
]

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const { hunter, settings, reload, pushToast } = useSystem()
  const { confirm, confirmElement } = useConfirm()
  const nav = useNavigate()

  const [profile, setProfile] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [usage, setUsage] = useState(null)

  useEffect(() => {
    if (hunter) {
      setProfile({
        display_name: hunter.display_name || '',
        birth_date: hunter.birth_date || '',
        sex: hunter.sex || '',
        height_cm: hunter.height_cm || '',
        timezone: hunter.timezone || 'Asia/Kolkata',
      })
    }
  }, [hunter])

  useEffect(() => {
    if (settings) setCfg({ ...settings, email: settings.email || user?.email || '' })
  }, [settings, user])

  useEffect(() => {
    supabase.from('ai_usage')
      .select('tokens_in,tokens_out,cached')
      .eq('usage_date', new Date().toISOString().slice(0, 10))
      .then(({ data }) => {
        const rows = data || []
        setUsage({
          tokens: rows.reduce((a, r) => a + num(r.tokens_in) + num(r.tokens_out), 0),
          calls: rows.length,
          cached: rows.filter((r) => r.cached).length,
        })
      })
  }, [])

  async function saveProfile() {
    setBusy(true)
    try {
      await supabase.from('hunters').update({
        display_name: profile.display_name.trim(),
        birth_date: profile.birth_date || null,
        sex: profile.sex || null,
        height_cm: profile.height_cm ? Number(profile.height_cm) : null,
        timezone: profile.timezone,
      }).eq('id', hunter.id)
      pushToast({ title: 'PROFILE SAVED', severity: 'OK' })
      reload()
    } catch (e) {
      pushToast({ title: 'COULD NOT SAVE', body: e.message, severity: 'DANGER' })
    } finally { setBusy(false) }
  }

  async function saveSettings() {
    setBusy(true)
    try {
      await supabase.from('user_settings').upsert({
        hunter_id: hunter.id,
        email: cfg.email || null,
        email_enabled: cfg.email_enabled,
        push_enabled: cfg.push_enabled,
        quiet_hours_start: Number(cfg.quiet_hours_start),
        quiet_hours_end: Number(cfg.quiet_hours_end),
        daily_quest_time: cfg.daily_quest_time,
        eval_hour: Number(cfg.eval_hour),
        system_voice: cfg.system_voice,
        reduce_motion: cfg.reduce_motion,
        ai_daily_token_cap: Number(cfg.ai_daily_token_cap),
      }, { onConflict: 'hunter_id' })

      document.documentElement.dataset.reduceMotion = String(!!cfg.reduce_motion)
      pushToast({ title: 'SETTINGS SAVED', severity: 'OK' })
      reload()
    } catch (e) {
      pushToast({ title: 'COULD NOT SAVE', body: e.message, severity: 'DANGER' })
    } finally { setBusy(false) }
  }

  async function togglePush() {
    setPushBusy(true)
    try {
      if (cfg.push_enabled) {
        await disablePush(hunter.id)
        setCfg({ ...cfg, push_enabled: false })
        pushToast({ title: 'PUSH DISABLED', severity: 'INFO' })
      } else {
        await enablePush(hunter.id)
        setCfg({ ...cfg, push_enabled: true })
        pushToast({ title: 'PUSH ENABLED', body: 'This device will now receive notifications.', severity: 'OK' })
      }
    } catch (e) {
      pushToast({ title: 'PUSH UNAVAILABLE', body: e.message, severity: 'WARN' })
    } finally { setPushBusy(false) }
  }

  async function exportData() {
    const tables = [
      'hunters', 'hunter_stats', 'xp_ledger', 'goals', 'quests', 'workout_sessions',
      'food_logs', 'body_metrics', 'transactions', 'tasks', 'skills', 'skill_sessions',
      'challenges', 'challenge_days', 'recipes', 'custom_foods', 'holdings', 'savings_goals',
    ]
    const out = {}
    for (const t of tables) {
      const { data } = await supabase.from(t).select('*')
      out[t] = data || []
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `system-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (!profile || !cfg) return <Loading label="Loading settings" />

  const capPct = usage ? Math.min(100, Math.round((usage.tokens / num(cfg.ai_daily_token_cap, 120000)) * 100)) : 0

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <div className="sys-eyebrow mb-1.5">Settings</div>
        <h1 className="font-display text-2xl text-bone leading-none">Configuration</h1>
      </div>

      {/* ---------------- profile ---------------- */}
      <Panel brackets>
        <PanelHeader eyebrow="Identity" title="Profile" />
        <div className="px-5 pb-5 space-y-4">
          <Field label="Name">
            <Input value={profile.display_name}
                   onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Date of birth">
              <Input type="date" value={profile.birth_date}
                     onChange={(e) => setProfile({ ...profile, birth_date: e.target.value })} />
            </Field>
            <Field label="Sex at birth" hint="Used by body-composition formulas.">
              <Select value={profile.sex} onChange={(e) => setProfile({ ...profile, sex: e.target.value })}>
                <option value="">Not set</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Prefer not to say</option>
              </Select>
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Height (cm)">
              <Input type="number" step="0.5" value={profile.height_cm}
                     onChange={(e) => setProfile({ ...profile, height_cm: e.target.value })} />
            </Field>
            <Field label="Timezone">
              <Input value={profile.timezone}
                     onChange={(e) => setProfile({ ...profile, timezone: e.target.value })} />
            </Field>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button variant="primary" icon={Save} loading={busy} onClick={saveProfile}>Save profile</Button>
            <span className="font-mono text-[10px] text-dim">{user?.email}</span>
          </div>
        </div>
      </Panel>

      {/* ---------------- notifications ---------------- */}
      <Panel>
        <PanelHeader eyebrow="Alerts" title="Notifications" />
        <div className="px-5 pb-5 space-y-4">
          <Field label="Email for reminders">
            <Input type="email" value={cfg.email} placeholder={user?.email}
                   onChange={(e) => setCfg({ ...cfg, email: e.target.value })} />
          </Field>

          <label className="flex items-start gap-3 cursor-pointer py-1">
            <input type="checkbox" checked={cfg.email_enabled} className="accent-[#3EC6FF] w-4 h-4 mt-0.5"
                   onChange={(e) => setCfg({ ...cfg, email_enabled: e.target.checked })} />
            <div>
              <span className="text-[13.5px] text-bone flex items-center gap-2">
                <Mail size={13} className="text-dim" /> Email notifications
              </span>
              <p className="text-[11.5px] text-dim mt-0.5">Task reminders, penalties, evaluations.</p>
            </div>
          </label>

          <div className="flex items-start justify-between gap-3 py-1">
            <div>
              <span className="text-[13.5px] text-bone flex items-center gap-2">
                <Smartphone size={13} className="text-dim" /> Push notifications
              </span>
              <p className="text-[11.5px] text-dim mt-0.5">
                {pushSupported()
                  ? 'Delivered to this device even when the app is closed.'
                  : 'This browser does not support push.'}
              </p>
            </div>
            <Button size="sm" loading={pushBusy} disabled={!pushSupported()} onClick={togglePush}>
              {cfg.push_enabled ? 'Disable' : 'Enable'}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-line pt-4">
            <Field label="Quiet hours start" hint="Only urgent alerts get through.">
              <Select value={cfg.quiet_hours_start}
                      onChange={(e) => setCfg({ ...cfg, quiet_hours_start: e.target.value })}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </Select>
            </Field>
            <Field label="Quiet hours end">
              <Select value={cfg.quiet_hours_end}
                      onChange={(e) => setCfg({ ...cfg, quiet_hours_end: e.target.value })}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Daily quest time" hint="When the board is issued.">
              <Input type="time" value={String(cfg.daily_quest_time).slice(0, 5)}
                     onChange={(e) => setCfg({ ...cfg, daily_quest_time: e.target.value })} />
            </Field>
            <Field label="Evaluation hour">
              <Select value={cfg.eval_hour} onChange={(e) => setCfg({ ...cfg, eval_hour: e.target.value })}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </Panel>

      {/* ---------------- the system ---------------- */}
      <Panel>
        <PanelHeader eyebrow="Behaviour" title="The System" />
        <div className="px-5 pb-5 space-y-4">
          <Field label="Voice">
            <div className="space-y-1.5">
              {VOICES.map((v) => (
                <button key={v.key} onClick={() => setCfg({ ...cfg, system_voice: v.key })}
                  className={cn('w-full text-left px-3.5 py-2.5 border transition-all',
                    cfg.system_voice === v.key
                      ? 'border-mana bg-mana/[0.07]' : 'border-line hover:border-line-lit')}>
                  <span className={cn('font-display text-[12px] uppercase tracking-wide',
                    cfg.system_voice === v.key ? 'text-mana' : 'text-ash')}>
                    {v.label}
                  </span>
                  <p className="text-[11.5px] text-dim mt-0.5">{v.hint}</p>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Daily AI token budget"
                 hint="A hard ceiling. When it is reached, the System falls back to deterministic logic rather than failing.">
            <Input type="number" step="10000" min="20000" max="1000000"
                   value={cfg.ai_daily_token_cap}
                   onChange={(e) => setCfg({ ...cfg, ai_daily_token_cap: e.target.value })} />
          </Field>

          {usage && (
            <div className="border border-line p-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="sys-eyebrow flex items-center gap-2"><Cpu size={11} /> Today</span>
                <span className="font-mono text-[10px] text-dim">
                  {usage.tokens.toLocaleString()} / {num(cfg.ai_daily_token_cap).toLocaleString()}
                </span>
              </div>
              <div className="sys-bar">
                <div className={cn('sys-bar__fill', capPct > 85 && 'sys-bar__fill--danger')}
                     style={{ width: `${capPct}%` }} />
              </div>
              <p className="font-mono text-[10px] text-dim mt-2">
                {usage.calls} CALLS · {usage.cached} SERVED FROM CACHE
              </p>
            </div>
          )}

          <label className="flex items-start gap-3 cursor-pointer py-1">
            <input type="checkbox" checked={cfg.reduce_motion} className="accent-[#3EC6FF] w-4 h-4 mt-0.5"
                   onChange={(e) => setCfg({ ...cfg, reduce_motion: e.target.checked })} />
            <div>
              <span className="text-[13.5px] text-bone flex items-center gap-2">
                <Moon size={13} className="text-dim" /> Reduce motion
              </span>
              <p className="text-[11.5px] text-dim mt-0.5">Disables scans, sweeps and the typed reveal.</p>
            </div>
          </label>

          <Button variant="primary" icon={Save} loading={busy} onClick={saveSettings}>Save settings</Button>
        </div>
      </Panel>

      {/* ---------------- data ---------------- */}
      <Panel>
        <PanelHeader eyebrow="Data" title="Your records" />
        <div className="px-5 pb-5 space-y-3">
          <p className="text-[12.5px] text-ash leading-relaxed">
            Everything you have logged, as JSON. Yours to keep.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button icon={Download} onClick={exportData}>Export everything</Button>
            <Button variant="danger" icon={LogOut}
              onClick={async () => {
                if (await confirm({ title: 'Sign out?', body: 'You can sign back in any time.', confirmLabel: 'Sign out' })) {
                  await signOut(); nav('/auth')
                }
              }}>
              Sign out
            </Button>
          </div>
        </div>
      </Panel>

      <p className="text-[11px] text-dim/70 leading-relaxed pb-4">
        An original build inspired by the premise of Solo Leveling. It bundles no artwork, characters,
        or text from the series and is not affiliated with or endorsed by its rights holders.
      </p>

      {confirmElement}
    </div>
  )
}
