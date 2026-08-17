import {
  createContext, useContext, useState, useEffect, useCallback, useRef, useMemo,
} from 'react'
import supabase from '../config/supabase'

const AuthCtx = createContext(null)
const SystemCtx = createContext(null)

/* ==================================================================== *
 * Auth
 * ==================================================================== */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      setLoading(false)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const value = useMemo(() => ({
    session, user, loading,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password, fullName) =>
      supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } }),
    signOut: () => supabase.auth.signOut(),
    resetPassword: (email) => supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    }),
  }), [session, user, loading])

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => {
  const c = useContext(AuthCtx)
  if (!c) throw new Error('useAuth must be used inside AuthProvider')
  return c
}

/* ==================================================================== *
 * System — player state, transient notifications, level-up events
 * ==================================================================== */
export function SystemProvider({ children }) {
  const { user } = useAuth()

  const [state, setState] = useState(null)     // whole get_player_state() payload
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState([])     // transient corner messages
  const [windowEvent, setWindowEvent] = useState(null) // full-screen SYSTEM window
  const seenEvents = useRef(new Set())

  const load = useCallback(async () => {
    if (!user) { setState(null); setLoading(false); return }
    const { data, error } = await supabase.rpc('get_player_state')
    if (!error && data) {
      setState(data)
      // Surface anything the hunter hasn't acknowledged yet.
      const unseen = data.unseen_events || []
      const fresh = unseen.filter((e) => !seenEvents.current.has(e.id))
      if (fresh.length) {
        fresh.forEach((e) => seenEvents.current.add(e.id))
        setWindowEvent(fresh[0])
      }
    }
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  /* Live notifications straight from Postgres. */
  useEffect(() => {
    if (!user) return
    const ch = supabase
      .channel(`sys:${user.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `hunter_id=eq.${user.id}` },
        ({ new: n }) => pushToast({ title: n.title, body: n.body, severity: n.severity }))
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'level_events', filter: `hunter_id=eq.${user.id}` },
        ({ new: e }) => {
          if (seenEvents.current.has(e.id)) return
          seenEvents.current.add(e.id)
          setWindowEvent(e)
          load()
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user, load])

  const pushToast = useCallback((t) => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev.slice(-3), { id, severity: 'INFO', ...t }])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.duration ?? 5200)
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const acknowledgeEvent = useCallback(async () => {
    const e = windowEvent
    setWindowEvent(null)
    if (e?.id) await supabase.from('level_events').update({ seen: true }).eq('id', e.id)
    const remaining = (state?.unseen_events || []).filter((x) => x.id !== e?.id && !seenEvents.current.has(x.id))
    if (remaining.length) {
      seenEvents.current.add(remaining[0].id)
      setTimeout(() => setWindowEvent(remaining[0]), 350)
    }
  }, [windowEvent, state])

  /** Optimistic patch for snappy UI; the server remains authoritative. */
  const patchHunter = useCallback((patch) => {
    setState((s) => (s ? { ...s, hunter: { ...s.hunter, ...patch } } : s))
  }, [])

  const value = useMemo(() => ({
    ...(state || {}),
    hunter: state?.hunter || null,
    stats: state?.stats || {},
    progress: state?.progress || { level: 1, xp_into_level: 0, xp_for_next: 40, total_xp: 0 },
    settings: state?.settings || null,
    targets: state?.targets || null,
    latestEval: state?.latest_eval || null,
    openPenalties: state?.open_penalties || 0,
    loading,
    reload: load,
    patchHunter,
    toasts, pushToast, dismissToast,
    windowEvent, acknowledgeEvent,
  }), [state, loading, load, patchHunter, toasts, pushToast, dismissToast, windowEvent, acknowledgeEvent])

  return <SystemCtx.Provider value={value}>{children}</SystemCtx.Provider>
}

export const useSystem = () => {
  const c = useContext(SystemCtx)
  if (!c) throw new Error('useSystem must be used inside SystemProvider')
  return c
}
