import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...a) => twMerge(clsx(a))

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

export const num = (v, fallback = 0) => {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : fallback
}

/** Indian numbering: 1,23,456 — the app's users think in lakhs, not thousands. */
export const inr = (n, opts = {}) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR',
    maximumFractionDigits: 0, ...opts,
  }).format(num(n))

export const compact = (n) => {
  const v = num(n)
  if (Math.abs(v) >= 1e7) return `${(v / 1e7).toFixed(2)}Cr`
  if (Math.abs(v) >= 1e5) return `${(v / 1e5).toFixed(2)}L`
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}k`
  return String(Math.round(v))
}

export const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const dateKey = (d) => {
  const x = d instanceof Date ? d : new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export const addDays = (d, n) => {
  const x = new Date(d instanceof Date ? d.getTime() : new Date(d).getTime())
  x.setDate(x.getDate() + n)
  return x
}

export function timeUntil(iso) {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  const over = ms < 0
  const a = Math.abs(ms)
  const h = Math.floor(a / 3600000)
  const m = Math.floor((a % 3600000) / 60000)
  const s = Math.floor((a % 60000) / 1000)
  return {
    over, ms,
    label: h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h`
         : h > 0 ? `${h}h ${String(m).padStart(2, '0')}m`
         : `${m}m ${String(s).padStart(2, '0')}s`,
  }
}

export const pct = (a, b) => (b > 0 ? clamp(Math.round((a / b) * 100), 0, 100) : 0)

/** Trailing-edge debounce, used by the food search box. */
export function debounce(fn, ms = 260) {
  let t
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
  wrapped.cancel = () => clearTimeout(t)
  return wrapped
}

export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'H'
