import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, HeartPulse, Wallet, ListChecks, BrainCircuit,
  Settings, LogOut, AlertTriangle,
} from 'lucide-react'
import { useAuth, useSystem } from '../../context/SystemContext'
import { ToastStack, SystemWindow, Loading } from '../system'
import { RankSigil, XPTrack } from '../system/StatusWindow'
import { cn } from '../../lib/utils'

const NAV = [
  { to: '/',        label: 'Status',  icon: LayoutDashboard, end: true },
  { to: '/health',  label: 'Health',  icon: HeartPulse },
  { to: '/finance', label: 'Finance', icon: Wallet },
  { to: '/tasks',   label: 'Tasks',   icon: ListChecks },
  { to: '/skills',  label: 'Skills',  icon: BrainCircuit },
]

export default function Layout() {
  const { signOut } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const {
    hunter, progress, loading, openPenalties,
    toasts, dismissToast, windowEvent, acknowledgeEvent,
  } = useSystem()

  if (loading) return <div className="min-h-dvh grid place-items-center"><Loading label="Reading status" /></div>

  return (
    <div className="min-h-dvh flex">
      {/* ---------- desktop rail ---------- */}
      <aside className="hidden lg:flex flex-col w-[236px] shrink-0 border-r border-line bg-abyss/60 sticky top-0 h-dvh">
        <div className="px-5 py-5 border-b border-line">
          <div className="sys-eyebrow mb-3">The System</div>
          {hunter && (
            <div className="flex items-center gap-3">
              <RankSigil rank={hunter.rank} size={38} />
              <div className="min-w-0">
                <p className="font-display text-[13px] text-bone truncate leading-tight">
                  {hunter.display_name}
                </p>
                <p className="font-mono text-[10px] text-dim mt-0.5">LV {hunter.level}</p>
              </div>
            </div>
          )}
          <div className="mt-4"><XPTrack progress={progress} compact /></div>
        </div>

        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-2.5 font-display text-[12px] uppercase tracking-[0.1em] transition-all border-l-2',
                isActive
                  ? 'border-mana text-mana bg-mana/[0.07]'
                  : 'border-transparent text-dim hover:text-ash hover:bg-white/[0.02]'
              )}>
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>

        {openPenalties > 0 && (
          <button onClick={() => nav('/')} className="mx-2.5 mb-2 flex items-center gap-2.5 px-3 py-2.5 border border-danger/40 bg-danger/[0.08] text-danger anim-pulse">
            <AlertTriangle size={14} />
            <span className="font-display text-[11px] uppercase tracking-wide">
              {openPenalties} penalt{openPenalties === 1 ? 'y' : 'ies'}
            </span>
          </button>
        )}

        <div className="px-2.5 py-3 border-t border-line space-y-0.5">
          <NavLink to="/settings"
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 font-display text-[12px] uppercase tracking-[0.1em] transition-colors border-l-2',
              isActive ? 'border-mana text-mana bg-mana/[0.07]' : 'border-transparent text-dim hover:text-ash'
            )}>
            <Settings size={16} /> Settings
          </NavLink>
          <button onClick={async () => { await signOut(); nav('/auth') }}
            className="w-full flex items-center gap-3 px-3 py-2.5 font-display text-[12px] uppercase tracking-[0.1em] text-dim hover:text-danger transition-colors border-l-2 border-transparent">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      {/* ---------- content ---------- */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between gap-3 px-4 h-14 border-b border-line bg-void/92 backdrop-blur safe-top">
          <div className="flex items-center gap-2.5 min-w-0">
            {hunter && <RankSigil rank={hunter.rank} size={28} />}
            <div className="min-w-0">
              <p className="font-display text-[12px] text-bone truncate leading-none">
                {hunter?.display_name}
              </p>
              <p className="font-mono text-[9px] text-dim mt-1">LV {hunter?.level}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {openPenalties > 0 && (
              <span className="flex items-center gap-1 px-2 py-1 border border-danger/40 text-danger font-mono text-[10px] anim-pulse">
                <AlertTriangle size={11} />{openPenalties}
              </span>
            )}
            <NavLink to="/settings" className="p-2 text-dim hover:text-bone" aria-label="Settings">
              <Settings size={17} />
            </NavLink>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-5 pb-24 lg:pb-10 max-w-content w-full mx-auto">
          <Outlet />
        </main>

        {/* ---------- mobile bar ---------- */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t border-line bg-void/95 backdrop-blur safe-bottom">
          {NAV.map(({ to, label, icon: Icon, end }) => {
            const active = end ? loc.pathname === to : loc.pathname.startsWith(to)
            return (
              <NavLink key={to} to={to} end={end}
                className={cn('flex flex-col items-center gap-1 py-2.5 transition-colors relative',
                  active ? 'text-mana' : 'text-dim')}>
                {active && <span className="absolute top-0 inset-x-3 h-px bg-mana shadow-[0_0_8px_#3EC6FF]" />}
                <Icon size={18} />
                <span className="font-display text-[9px] uppercase tracking-[0.08em]">{label}</span>
              </NavLink>
            )
          })}
        </nav>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <SystemWindow event={windowEvent} onClose={acknowledgeEvent} />
    </div>
  )
}
