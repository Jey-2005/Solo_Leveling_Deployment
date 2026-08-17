import { useMemo } from 'react'
import { iconFor } from '../../data/icons'
import { STATS, RANKS, rankForLevel, nextRank } from '../../data/system'
import { cn } from '../../lib/utils'
import { Panel, Bar } from './index'

/* ==================================================================== *
 * RankSigil — the hexagonal rank badge
 * ==================================================================== */
export function RankSigil({ rank = 'E', size = 44, level }) {
  const meta = RANKS.find((r) => r.key === rank) || RANKS[0]
  const label = rank === 'NATIONAL' ? 'N' : rank
  return (
    <div className="relative shrink-0 grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" aria-hidden>
        <polygon points="50,3 93,26 93,74 50,97 7,74 7,26"
                 fill={`${meta.color}14`} stroke={meta.color} strokeWidth="3" />
        <polygon points="50,14 83,32 83,68 50,86 17,68 17,32"
                 fill="none" stroke={meta.color} strokeWidth="1" opacity=".35" />
      </svg>
      <span className="relative font-display font-bold leading-none"
            style={{ color: meta.color, fontSize: size * 0.42, textShadow: `0 0 12px ${meta.color}66` }}>
        {label}
      </span>
      {level != null && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 bg-abyss font-mono text-[8px] text-dim">
          {level}
        </span>
      )}
    </div>
  )
}

/* ==================================================================== *
 * StatHex — six-axis attribute radar, drawn as SVG
 * ==================================================================== */
export function StatHex({ stats, size = 220, showLabels = true }) {
  const cx = 50, cy = 50, R = 34

  const points = useMemo(() => {
    // Scale to whichever is larger: the strongest attribute, or 40 —
    // so an early hunter's shape isn't a dot in the middle.
    const values = STATS.map((s) => stats?.[s.key]?.value ?? 10)
    const max = Math.max(40, ...values)
    return STATS.map((s, i) => {
      const angle = (Math.PI / 180) * (i * 60 - 90)
      const v = (stats?.[s.key]?.value ?? 10) / max
      return {
        stat: s,
        value: stats?.[s.key]?.value ?? 10,
        mult: stats?.[s.key]?.multiplier ?? 1,
        x: cx + Math.cos(angle) * R * v,
        y: cy + Math.sin(angle) * R * v,
        ax: cx + Math.cos(angle) * R,
        ay: cy + Math.sin(angle) * R,
        lx: cx + Math.cos(angle) * (R + 12),
        ly: cy + Math.sin(angle) * (R + 12),
      }
    })
  }, [stats])

  const web = (scale) => STATS.map((_, i) => {
    const a = (Math.PI / 180) * (i * 60 - 90)
    return `${cx + Math.cos(a) * R * scale},${cy + Math.sin(a) * R * scale}`
  }).join(' ')

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" role="img"
           aria-label="Attribute radar">
        <defs>
          <radialGradient id="hexfill" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#3EC6FF" stopOpacity=".42" />
            <stop offset="100%" stopColor="#6D3EE8" stopOpacity=".16" />
          </radialGradient>
        </defs>

        {[0.25, 0.5, 0.75, 1].map((s) => (
          <polygon key={s} points={web(s)} fill="none"
                   stroke="#1E2739" strokeWidth={s === 1 ? 0.7 : 0.4} />
        ))}
        {points.map((p) => (
          <line key={p.stat.key} x1={cx} y1={cy} x2={p.ax} y2={p.ay} stroke="#1E2739" strokeWidth=".35" />
        ))}

        <polygon
          points={points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="url(#hexfill)" stroke="#3EC6FF" strokeWidth="1.1"
          style={{ filter: 'drop-shadow(0 0 5px rgba(62,198,255,.5))' }}
        />
        {points.map((p) => (
          <circle key={p.stat.key} cx={p.x} cy={p.y} r="1.5" fill={p.stat.color} stroke="#05060B" strokeWidth=".5" />
        ))}

        {showLabels && points.map((p) => (
          <g key={p.stat.key}>
            <text x={p.lx} y={p.ly - 1} textAnchor="middle" fontSize="4.4"
                  fontFamily="JetBrains Mono, monospace" fill="#5C6880" letterSpacing=".5">
              {p.stat.key}
            </text>
            <text x={p.lx} y={p.ly + 4.4} textAnchor="middle" fontSize="5.6" fontWeight="700"
                  fontFamily="Chakra Petch, sans-serif" fill={p.stat.color}>
              {p.value}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

/* ==================================================================== *
 * StatRow — attribute list with multiplier tell
 * ==================================================================== */
export function StatList({ stats, className }) {
  return (
    <div className={cn('divide-y divide-line', className)}>
      {STATS.map((s) => {
        const d = stats?.[s.key] || { value: 10, xp: 0, multiplier: 1 }
        const Icon = iconFor(s.icon)
        const mult = Number(d.multiplier ?? 1)
        return (
          <div key={s.key} className="flex items-center gap-3 py-2.5 px-1 group">
            <Icon size={15} style={{ color: s.color }} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[11px] uppercase tracking-[0.12em] text-ash">{s.name}</span>
                {mult !== 1 && (
                  <span className={cn('font-mono text-[9px] px-1 border',
                    mult > 1 ? 'text-jade border-jade/30 bg-jade/10' : 'text-danger border-danger/30 bg-danger/10')}>
                    ×{mult.toFixed(2)}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-dim mt-0.5 leading-tight hidden group-hover:block sm:block">
                {s.blurb}
              </p>
            </div>
            <span className="sys-num text-xl shrink-0" style={{ color: s.color }}>{d.value}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ==================================================================== *
 * XPTrack — level progress with the next rank marked on the bar
 * ==================================================================== */
export function XPTrack({ progress, rank, compact }) {
  const into = Number(progress?.xp_into_level ?? 0)
  const need = Number(progress?.xp_for_next ?? 40)
  const lvl = progress?.level ?? 1
  const nr = nextRank(lvl)

  return (
    <div className="w-full">
      <div className="flex items-end justify-between mb-1.5 gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="sys-eyebrow">Level</span>
          <span className="sys-num text-2xl text-bone leading-none">{lvl}</span>
        </div>
        <span className="font-mono text-[10px] text-dim shrink-0">
          {into.toLocaleString()} / {need.toLocaleString()}
        </span>
      </div>
      <Bar value={into} max={need} tone="mana" height={compact ? 5 : 7} />
      {!compact && nr && (
        <p className="mt-1.5 font-mono text-[10px] text-dim">
          {nr.min - lvl} level{nr.min - lvl === 1 ? '' : 's'} to{' '}
          <span style={{ color: nr.color }}>{nr.label}</span>
        </p>
      )}
    </div>
  )
}

/* ==================================================================== *
 * StatusWindow — the hunter's identity card
 * ==================================================================== */
export function StatusWindow({ hunter, stats, progress, latestEval, className }) {
  if (!hunter) return null
  const meta = rankForLevel(hunter.level)
  const integrity = Number(hunter.integrity_score ?? 100)
  const diff = Number(hunter.difficulty_scalar ?? 1)

  return (
    <Panel tone="lit" brackets scan className={cn('overflow-hidden', className)}>
      <div className="sys-grid-bg absolute inset-0 opacity-50 pointer-events-none" />

      <div className="relative p-5">
        <div className="sys-eyebrow mb-4">Status</div>

        <div className="flex items-start gap-4">
          <RankSigil rank={hunter.rank} size={56} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-bold text-bone leading-tight truncate">
              {hunter.display_name}
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: meta.color }}>
              {meta.label} · {hunter.title || meta.title}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <XPTrack progress={progress} rank={hunter.rank} />
        </div>

        <div className="mt-6">
          <StatHex stats={stats} size={230} />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-px bg-line border border-line">
          {[
            { label: 'Streak', value: hunter.streak_days ?? 0, unit: 'd',
              tone: (hunter.streak_days ?? 0) > 0 ? 'text-gold' : 'text-dim' },
            { label: 'Integrity', value: Math.round(integrity), unit: '',
              tone: integrity >= 85 ? 'text-jade' : integrity >= 60 ? 'text-gold' : 'text-danger' },
            { label: 'Difficulty', value: diff.toFixed(2), unit: '×',
              tone: diff > 1.15 ? 'text-danger' : diff < 0.9 ? 'text-jade' : 'text-mana' },
          ].map((m) => (
            <div key={m.label} className="bg-abyss px-3 py-2.5 text-center">
              <div className="sys-eyebrow justify-center mb-1 !text-[8px]">{m.label}</div>
              <div className={cn('sys-num text-lg', m.tone)}>{m.value}<span className="text-[11px] ml-px">{m.unit}</span></div>
            </div>
          ))}
        </div>

        {latestEval?.verdict_title && (
          <div className="mt-5 border-l-2 border-monarch pl-3.5 py-1">
            <p className="font-display text-[11px] uppercase tracking-[0.14em] text-monarch">
              {latestEval.verdict_title}
            </p>
            {latestEval.verdict_body && (
              <p className="text-[13px] text-ash mt-1.5 leading-relaxed">{latestEval.verdict_body}</p>
            )}
            {latestEval.directive && (
              <p className="text-[12px] text-bone mt-2 leading-relaxed">
                <span className="font-mono text-[9px] text-monarch tracking-[0.2em] mr-2">DIRECTIVE</span>
                {latestEval.directive}
              </p>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}
