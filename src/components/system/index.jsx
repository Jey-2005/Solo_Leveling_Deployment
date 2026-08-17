import { useEffect, useRef, useState, useCallback, forwardRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, AlertTriangle, Check, Info, Sparkles, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'

/* ==================================================================== *
 * Panel — the system window. Every surface in the app is one of these.
 * ==================================================================== */
/* forwardRef matters here: Modal focuses the dialog on open so keyboard and
 * screen-reader users aren't stranded behind the overlay. Without it React
 * drops the ref and that focus never lands. */
export const Panel = forwardRef(function Panel({
  children, className, tone = 'default', brackets = false, scan = false, as: Tag = 'div', ...rest
}, ref) {
  const toneClass = {
    default: '',
    lit: 'sys-panel--lit',
    monarch: 'sys-panel--monarch',
    danger: 'sys-panel--danger',
  }[tone]
  const bracketTone = { monarch: 'sys-brackets--monarch', danger: 'sys-brackets--danger' }[tone] || ''

  return (
    <Tag
      ref={ref}
      className={cn('sys-panel', toneClass, brackets && `sys-brackets ${bracketTone}`, scan && 'sys-scan', className)}
      {...rest}
    >
      {brackets && <><span className="bracket-bl" /><span className="bracket-br" /></>}
      {children}
    </Tag>
  )
})

export function PanelHeader({ eyebrow, title, right, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="sys-eyebrow mb-1.5">{eyebrow}</div>}
        {title && <h2 className="text-[17px] leading-tight text-bone truncate">{title}</h2>}
      </div>
      {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
    </div>
  )
}

/* ==================================================================== *
 * Buttons / inputs
 * ==================================================================== */
export function Button({
  children, variant = 'default', size, loading, className, disabled, icon: Icon, ...rest
}) {
  return (
    <button
      className={cn(
        'sys-btn',
        variant !== 'default' && `sys-btn--${variant}`,
        size === 'sm' && 'sys-btn--sm',
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={14} className="anim-spin" /> : Icon ? <Icon size={14} /> : null}
      {children}
    </button>
  )
}

export function Field({ label, hint, error, children, className }) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && <label className="sys-label">{label}</label>}
      {children}
      {error
        ? <p className="mt-1.5 text-[11px] text-danger">{error}</p>
        : hint ? <p className="mt-1.5 text-[11px] text-dim leading-snug">{hint}</p> : null}
    </div>
  )
}

export const Input = (p) => <input {...p} className={cn('sys-input', p.className)} />
export const Textarea = (p) => <textarea {...p} className={cn('sys-input', p.className)} />
export const Select = ({ children, ...p }) => (
  <select {...p} className={cn('sys-input', p.className)}>{children}</select>
)

export function Chip({ children, tone, className, ...rest }) {
  return (
    <span className={cn('sys-chip', tone && `sys-chip--${tone}`, className)} {...rest}>{children}</span>
  )
}

/* ==================================================================== *
 * Progress
 * ==================================================================== */
export function Bar({ value, max = 100, tone, className, height }) {
  const pctv = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className={cn('sys-bar', className)} style={height ? { height } : undefined}>
      <div className={cn('sys-bar__fill', tone && `sys-bar__fill--${tone}`)} style={{ width: `${pctv}%` }} />
    </div>
  )
}

/* ==================================================================== *
 * Tabs
 * ==================================================================== */
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cn('flex items-center gap-1 overflow-x-auto scrollbar-none border-b border-line', className)}
         role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          data-active={value === t.key}
          className="sys-tab"
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.badge != null && t.badge > 0 && (
            <span className="ml-1.5 inline-block px-1.5 py-px text-[9px] font-mono bg-mana/15 text-mana border border-mana/30">
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/* ==================================================================== *
 * Modal
 * ==================================================================== */
export function Modal({ open, onClose, title, eyebrow, children, footer, wide, tone = 'lit' }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // move focus into the dialog so keyboard users aren't stranded behind it
    setTimeout(() => ref.current?.focus(), 30)
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-void/88 backdrop-blur-sm" onClick={onClose} />
      <Panel
        ref={ref}
        tabIndex={-1}
        tone={tone}
        brackets
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative w-full max-h-[92vh] overflow-y-auto anim-open outline-none',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 sticky top-0 bg-abyss/95 backdrop-blur z-10 border-b border-line">
          <div className="min-w-0">
            {eyebrow && <div className="sys-eyebrow mb-1.5">{eyebrow}</div>}
            <h2 className="text-lg text-bone leading-tight">{title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close"
                  className="shrink-0 p-1.5 text-dim hover:text-bone transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-line flex flex-wrap items-center justify-end gap-2 sticky bottom-0 bg-abyss/95 backdrop-blur">
            {footer}
          </div>
        )}
      </Panel>
    </div>,
    document.body
  )
}

/* ==================================================================== *
 * Toasts
 * ==================================================================== */
const TOAST_TONE = {
  INFO:   { icon: Info,          cls: 'border-mana/40 text-mana' },
  WARN:   { icon: AlertTriangle, cls: 'border-gold/40 text-gold' },
  DANGER: { icon: AlertTriangle, cls: 'border-danger/50 text-danger' },
  REWARD: { icon: Sparkles,      cls: 'border-monarch/45 text-monarch' },
  OK:     { icon: Check,         cls: 'border-jade/40 text-jade' },
}

export function ToastStack({ toasts, onDismiss }) {
  if (!toasts?.length) return null
  return createPortal(
    <div className="fixed top-3 right-3 z-[120] flex flex-col gap-2 w-[min(360px,calc(100vw-24px))] pointer-events-none safe-top">
      {toasts.map((t) => {
        const { icon: Icon, cls } = TOAST_TONE[t.severity] || TOAST_TONE.INFO
        return (
          <Panel key={t.id} className={cn('anim-slide pointer-events-auto border', cls)}>
            <div className="flex gap-3 p-3.5">
              <Icon size={16} className="shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-[12px] font-semibold tracking-wide uppercase leading-tight">
                  {t.title}
                </p>
                {t.body && <p className="text-[13px] text-ash mt-1 leading-snug">{t.body}</p>}
              </div>
              <button onClick={() => onDismiss(t.id)} aria-label="Dismiss"
                      className="shrink-0 text-dim hover:text-bone transition-colors">
                <X size={14} />
              </button>
            </div>
          </Panel>
        )
      })}
    </div>,
    document.body
  )
}

/* ==================================================================== *
 * SystemWindow — the signature moment. Level-ups and rank changes get a
 * full-screen interruption with a typed reveal, exactly like the notice
 * panels the premise is built around.
 * ==================================================================== */
export function SystemWindow({ event, onClose }) {
  const [typed, setTyped] = useState('')
  const message = event?.message || ''

  useEffect(() => {
    if (!event) return
    const reduce = document.documentElement.dataset.reduceMotion === 'true'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setTyped(message); return }
    setTyped('')
    let i = 0
    const id = setInterval(() => {
      i += 1
      setTyped(message.slice(0, i))
      if (i >= message.length) clearInterval(id)
    }, 18)
    return () => clearInterval(id)
  }, [event, message])

  if (!event) return null

  const kind = event.kind
  const tone = kind === 'RANK_DOWN' || kind === 'DECAY' ? 'danger'
    : kind === 'RANK_UP' || kind === 'AWAKENING' ? 'monarch' : 'lit'
  const heading = {
    LEVEL_UP: 'Level Up',
    RANK_UP: 'Rank Increased',
    RANK_DOWN: 'Rank Reduced',
    DECAY: 'Regression',
    AWAKENING: 'Notification',
  }[kind] || 'Notification'

  const accent = tone === 'danger' ? 'text-danger' : tone === 'monarch' ? 'text-monarch' : 'text-mana'

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4"
         role="alertdialog" aria-label={heading}>
      <div className="absolute inset-0 bg-void/92 backdrop-blur-md" onClick={onClose} />
      <Panel tone={tone} brackets scan className="relative w-full max-w-md anim-open">
        <div className="sys-grid-bg absolute inset-0 opacity-40 pointer-events-none" />
        <div className="relative px-7 py-9 text-center">
          <div className={cn('sys-eyebrow justify-center mb-5', accent)}>System Notification</div>

          <h2 className={cn(
            'font-display text-[30px] font-bold uppercase tracking-[0.06em] leading-none mb-1',
            accent,
            tone === 'danger' ? 'text-glow-danger' : tone === 'monarch' ? 'text-glow-monarch' : 'text-glow-mana'
          )}>
            {heading}
          </h2>

          {event.from_value && event.to_value && (
            <div className="flex items-center justify-center gap-3 my-6">
              <span className="sys-num text-3xl text-dim">{event.from_value}</span>
              <ChevronRight size={20} className={accent} />
              <span className={cn('sys-num text-5xl', accent)}>{event.to_value}</span>
            </div>
          )}

          <p className="text-[15px] text-ash leading-relaxed min-h-[3rem] px-2">
            {typed}
            <span className="inline-block w-[2px] h-[1em] align-middle ml-0.5 bg-current anim-pulse" />
          </p>

          <Button
            variant={tone === 'monarch' ? 'monarch' : tone === 'danger' ? 'danger' : 'primary'}
            className="mt-7 w-full justify-center"
            onClick={onClose}
          >
            Acknowledge
          </Button>
        </div>
      </Panel>
    </div>,
    document.body
  )
}

/* ==================================================================== *
 * States
 * ==================================================================== */
export function Empty({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {Icon && (
        <div className="w-12 h-12 grid place-items-center border border-line-lit mb-4"
             style={{ clipPath: 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)' }}>
          <Icon size={19} className="text-dim" />
        </div>
      )}
      <p className="font-display text-sm text-ash uppercase tracking-wide">{title}</p>
      {hint && <p className="text-[13px] text-dim mt-1.5 max-w-xs leading-snug">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Loading({ label = 'Loading', className }) {
  return (
    <div className={cn('flex items-center justify-center gap-3 py-14 text-dim', className)}>
      <Loader2 size={16} className="anim-spin text-mana" />
      <span className="font-mono text-[10px] tracking-[0.28em] uppercase">{label}</span>
    </div>
  )
}

export function Skeleton({ className }) {
  return <div className={cn('bg-line/60 anim-pulse', className)} />
}

/** Inline banner used when an AI response came from the fallback path. */
export function DegradedNote({ reason }) {
  if (!reason) return null
  return (
    <div className="flex gap-2.5 p-3 border border-gold/30 bg-gold/[0.06] text-[12px] text-gold/90 leading-snug">
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <span>{reason}</span>
    </div>
  )
}

/* ==================================================================== *
 * Confirm — replaces window.confirm so destructive actions stay in-world
 * ==================================================================== */
export function useConfirm() {
  const [req, setReq] = useState(null)

  const confirm = useCallback((opts) => new Promise((resolve) => {
    setReq({ ...opts, resolve })
  }), [])

  const element = req ? (
    <Modal
      open
      tone="danger"
      eyebrow="Confirm"
      title={req.title || 'Are you sure?'}
      onClose={() => { req.resolve(false); setReq(null) }}
      footer={
        <>
          <Button size="sm" onClick={() => { req.resolve(false); setReq(null) }}>Cancel</Button>
          <Button size="sm" variant="danger" onClick={() => { req.resolve(true); setReq(null) }}>
            {req.confirmLabel || 'Delete'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ash leading-relaxed">{req.body || 'This cannot be undone.'}</p>
    </Modal>
  ) : null

  return { confirm, confirmElement: element }
}
