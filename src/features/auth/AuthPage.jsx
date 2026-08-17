import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Mail, Lock, User, ArrowRight } from 'lucide-react'
import { useAuth } from '../../context/SystemContext'
import { Panel, Button, Field, Input } from '../../components/system'

export default function AuthPage() {
  const { user, signIn, signUp, resetPassword } = useAuth()
  const loc = useLocation()

  const [mode, setMode] = useState('in')  // in | up | reset
  const [form, setForm] = useState({ email: '', password: '', name: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  if (user) return <Navigate to={loc.state?.from?.pathname || '/'} replace />

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setErr(''); setMsg(''); setBusy(true)
    try {
      if (mode === 'reset') {
        const { error } = await resetPassword(form.email.trim())
        if (error) throw error
        setMsg('If that address has an account, a reset link is on its way.')
      } else if (mode === 'up') {
        if (form.password.length < 8) throw new Error('Password must be at least 8 characters.')
        const { error } = await signUp(form.email.trim(), form.password, form.name.trim())
        if (error) throw error
        setMsg('Account created. Check your inbox if confirmation is required, then sign in.')
        setMode('in')
      } else {
        const { error } = await signIn(form.email.trim(), form.password)
        if (error) throw error
      }
    } catch (e2) {
      setErr(e2.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh grid place-items-center px-4 py-10 relative overflow-hidden">
      {/* the gate */}
      <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center opacity-[0.16]">
        <svg viewBox="0 0 400 400" className="w-[min(120vw,760px)] anim-spin-slow">
          <defs>
            <linearGradient id="gate" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#3EC6FF" /><stop offset="1" stopColor="#6D3EE8" />
            </linearGradient>
          </defs>
          <polygon points="200,20 355,110 355,290 200,380 45,290 45,110"
                   fill="none" stroke="url(#gate)" strokeWidth="1.2" />
          <polygon points="200,60 320,130 320,270 200,340 80,270 80,130"
                   fill="none" stroke="url(#gate)" strokeWidth="0.7" />
          <circle cx="200" cy="200" r="118" fill="none" stroke="#3EC6FF" strokeWidth="0.5"
                  strokeDasharray="3 9" />
          <circle cx="200" cy="200" r="86" fill="none" stroke="#A78BFA" strokeWidth="0.5"
                  strokeDasharray="12 6" />
        </svg>
      </div>

      <div className="relative w-full max-w-[400px]">
        <div className="text-center mb-7">
          <div className="sys-eyebrow justify-center mb-3">Arise</div>
          <h1 className="font-display text-[34px] font-bold uppercase tracking-[0.08em] text-bone leading-none text-glow-mana">
            The System
          </h1>
          <p className="text-[13px] text-dim mt-3 leading-relaxed max-w-[300px] mx-auto">
            Only the ones who are chosen can enter. Log the work. Get judged on it. Level up.
          </p>
        </div>

        <Panel tone="lit" brackets className="anim-open">
          <form onSubmit={submit} className="p-6 space-y-4">
            <div className="flex gap-1 mb-5 border-b border-line -mx-6 px-6">
              {[['in', 'Sign in'], ['up', 'Awaken']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => { setMode(k); setErr(''); setMsg('') }}
                        data-active={mode === k} className="sys-tab">
                  {label}
                </button>
              ))}
            </div>

            {mode === 'up' && (
              <Field label="Name" hint="What the System should call you.">
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
                  <Input value={form.name} onChange={set('name')} required
                         className="pl-9" placeholder="Sung Jinwoo" autoComplete="name" />
                </div>
              </Field>
            )}

            <Field label="Email">
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
                <Input type="email" value={form.email} onChange={set('email')} required
                       className="pl-9" placeholder="you@example.com" autoComplete="email" />
              </div>
            </Field>

            {mode !== 'reset' && (
              <Field label="Password" hint={mode === 'up' ? 'Minimum 8 characters.' : undefined}>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
                  <Input type="password" value={form.password} onChange={set('password')} required
                         className="pl-9" placeholder="••••••••"
                         autoComplete={mode === 'up' ? 'new-password' : 'current-password'} />
                </div>
              </Field>
            )}

            {err && (
              <p className="text-[12px] text-danger border-l-2 border-danger pl-3 py-1 leading-snug">{err}</p>
            )}
            {msg && (
              <p className="text-[12px] text-jade border-l-2 border-jade pl-3 py-1 leading-snug">{msg}</p>
            )}

            <Button type="submit" variant="primary" loading={busy} className="w-full justify-center !py-3">
              {mode === 'up' ? 'Awaken' : mode === 'reset' ? 'Send reset link' : 'Enter'}
              {!busy && <ArrowRight size={14} />}
            </Button>

            <button type="button"
                    onClick={() => { setMode(mode === 'reset' ? 'in' : 'reset'); setErr(''); setMsg('') }}
                    className="w-full text-center font-mono text-[10px] tracking-[0.16em] uppercase text-dim hover:text-mana transition-colors pt-1">
              {mode === 'reset' ? 'Back to sign in' : 'Forgotten password'}
            </button>
          </form>
        </Panel>

        <p className="text-center text-[10px] text-dim/70 mt-6 font-mono tracking-wider">
          An original build. Not affiliated with, or endorsed by, the Solo Leveling rights holders.
        </p>
      </div>
    </div>
  )
}
