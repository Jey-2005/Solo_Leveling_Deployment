import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Plus, Trash2, Wallet, TrendingUp, PiggyBank, Repeat, LineChart as LineIcon,
  Sparkles, ArrowUpRight, ArrowDownRight, Target, ShieldAlert,
} from 'lucide-react'
import {
  BarChart, Bar as RBar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip,
} from 'recharts'
import supabase from '../../config/supabase'
import { useSystem } from '../../context/SystemContext'
import { ai } from '../../lib/api'
import {
  Panel, PanelHeader, Button, Field, Input, Select, Textarea, Chip,
  Empty, Loading, Modal, Tabs, Bar, DegradedNote, useConfirm,
} from '../../components/system'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, ASSET_CLASSES } from '../../data/system'
import { cn, inr, compact, todayKey, num, pct } from '../../lib/utils'

const PALETTE = ['#3EC6FF', '#A78BFA', '#F5C542', '#34D399', '#FF3B5C', '#FB923C',
                 '#63D3FF', '#CBAAFF', '#8FD49B', '#FFB3C1']

const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

/* ==================================================================== *
 * Transactions
 * ==================================================================== */
function TxnTab({ txns, reload }) {
  const { pushToast } = useSystem()
  const { confirm, confirmElement } = useConfirm()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    kind: 'EXPENSE', amount: '', category: 'Groceries', merchant: '',
    note: '', txn_date: todayKey(), is_planned: false,
  })

  const thisMonth = useMemo(() => {
    const start = monthStart()
    return txns.filter((t) => t.txn_date >= start)
  }, [txns])

  const income = thisMonth.filter((t) => t.kind === 'INCOME').reduce((a, t) => a + num(t.amount), 0)
  const spend  = thisMonth.filter((t) => t.kind === 'EXPENSE').reduce((a, t) => a + num(t.amount), 0)
  const rate   = income > 0 ? Math.round(((income - spend) / income) * 100) : null
  const planned = thisMonth.filter((t) => t.kind === 'EXPENSE' && t.is_planned)
    .reduce((a, t) => a + num(t.amount), 0)

  const byCategory = useMemo(() => {
    const m = {}
    thisMonth.filter((t) => t.kind === 'EXPENSE')
      .forEach((t) => { m[t.category] = (m[t.category] || 0) + num(t.amount) })
    return Object.entries(m).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 8)
  }, [thisMonth])

  async function save() {
    if (!f.amount) return
    setBusy(true)
    try {
      const { error } = await supabase.from('transactions').insert({
        kind: f.kind, amount: Number(f.amount), category: f.category,
        merchant: f.merchant || null, note: f.note || null,
        txn_date: f.txn_date, is_planned: f.is_planned,
      })
      if (error) throw error
      setOpen(false)
      setF({ ...f, amount: '', merchant: '', note: '' })
      reload()
    } catch (e) {
      pushToast({ title: 'COULD NOT SAVE', body: e.message, severity: 'DANGER' })
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line">
        {[
          { label: 'Income', value: inr(income), color: '#34D399', icon: ArrowUpRight },
          { label: 'Spent', value: inr(spend), color: '#FF3B5C', icon: ArrowDownRight },
          { label: 'Kept', value: inr(income - spend), color: income - spend >= 0 ? '#3EC6FF' : '#FF3B5C' },
          { label: 'Savings rate', value: rate == null ? '—' : `${rate}%`,
            color: rate == null ? '#5C6880' : rate >= 20 ? '#34D399' : rate >= 10 ? '#F5C542' : '#FF3B5C' },
        ].map((m) => (
          <div key={m.label} className="bg-abyss px-4 py-3.5">
            <div className="sys-eyebrow !text-[8px] mb-1.5">{m.label}</div>
            <div className="sys-num text-lg leading-none" style={{ color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {spend > 0 && (
        <div className="grid lg:grid-cols-2 gap-5">
          <Panel>
            <PanelHeader eyebrow="This month" title="Where it went" />
            <div className="px-3 pb-5 h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name"
                       cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={2}
                       stroke="#05060B" strokeWidth={2}>
                    {byCategory.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v) => inr(v)}
                    contentStyle={{ background: '#0A0E1A', border: '1px solid #1E2739',
                                    borderRadius: 2, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel>
            <PanelHeader eyebrow="Breakdown" title="By category" />
            <div className="px-5 pb-5 space-y-2.5">
              {byCategory.map((c, i) => (
                <div key={c.name}>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[12.5px] text-ash truncate">{c.name}</span>
                    <span className="font-mono text-[11px] text-bone shrink-0 ml-2">{inr(c.value)}</span>
                  </div>
                  <div className="sys-bar" style={{ height: 4 }}>
                    <div className="sys-bar__fill" style={{
                      width: `${pct(c.value, spend)}%`,
                      background: PALETTE[i % PALETTE.length],
                    }} />
                  </div>
                </div>
              ))}
              {planned > 0 && (
                <p className="text-[11px] text-dim pt-2 leading-snug">
                  {inr(planned)} of that was marked planned — {Math.round((planned / spend) * 100)}% of spending.
                </p>
              )}
            </div>
          </Panel>
        </div>
      )}

      <Panel brackets>
        <PanelHeader
          eyebrow={`${txns.length} entries`} title="Transactions"
          right={<Button size="sm" variant="primary" icon={Plus} onClick={() => setOpen(true)}>Add</Button>}
        />
        <div className="px-5 pb-5">
          {txns.length === 0 ? (
            <Empty icon={Wallet} title="Nothing recorded"
                   hint="Log income and spending. Perception grows from control, not from income." />
          ) : (
            <div className="divide-y divide-line max-h-[520px] overflow-y-auto">
              {txns.slice(0, 120).map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-2.5 group">
                  <div className={cn('w-1 h-8 shrink-0',
                    t.kind === 'INCOME' ? 'bg-jade' : t.is_planned ? 'bg-mana' : 'bg-danger')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-bone truncate">
                      {t.merchant || t.category}
                      {t.is_planned && <span className="ml-2 font-mono text-[9px] text-mana">PLANNED</span>}
                    </p>
                    <p className="font-mono text-[10px] text-dim mt-0.5">
                      {t.txn_date} · {t.category}
                    </p>
                  </div>
                  <span className={cn('sys-num text-[13px] shrink-0',
                    t.kind === 'INCOME' ? 'text-jade' : 'text-bone')}>
                    {t.kind === 'INCOME' ? '+' : '−'}{inr(t.amount)}
                  </span>
                  <button
                    onClick={async () => {
                      if (await confirm({ title: 'Delete entry?', body: `${t.category} · ${inr(t.amount)}` })) {
                        await supabase.from('transactions').delete().eq('id', t.id); reload()
                      }
                    }}
                    className="shrink-0 p-1 text-dim opacity-0 group-hover:opacity-100 hover:text-danger transition-all"
                    aria-label="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Modal open={open} onClose={() => setOpen(false)} eyebrow="Finance" title="New entry"
        footer={
          <>
            <Button size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button size="sm" variant="primary" loading={busy} disabled={!f.amount} onClick={save}>Save</Button>
          </>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-1.5">
            {[['EXPENSE', 'Spent'], ['INCOME', 'Received']].map(([k, l]) => (
              <button key={k} onClick={() => setF({
                ...f, kind: k, category: k === 'INCOME' ? 'Salary' : 'Groceries',
              })}
                className={cn('py-2.5 border font-display text-[12px] uppercase tracking-wide transition-all',
                  f.kind === k ? 'border-mana text-mana bg-mana/10' : 'border-line text-dim hover:border-line-lit')}>
                {l}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount (₹)">
              <Input type="number" inputMode="decimal" autoFocus value={f.amount}
                     onChange={(e) => setF({ ...f, amount: e.target.value })} />
            </Field>
            <Field label="Date">
              <Input type="date" value={f.txn_date} max={todayKey()}
                     onChange={(e) => setF({ ...f, txn_date: e.target.value })} />
            </Field>
          </div>

          <Field label="Category">
            <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {(f.kind === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>

          <Field label="Merchant / source">
            <Input value={f.merchant} placeholder="Optional"
                   onChange={(e) => setF({ ...f, merchant: e.target.value })} />
          </Field>

          {f.kind === 'EXPENSE' && (
            <label className="flex items-start gap-2.5 cursor-pointer py-1">
              <input type="checkbox" checked={f.is_planned} className="accent-[#3EC6FF] w-4 h-4 mt-0.5"
                     onChange={(e) => setF({ ...f, is_planned: e.target.checked })} />
              <span className="text-[13px] text-ash leading-snug">
                This was planned
                <span className="block text-[11px] text-dim mt-0.5">
                  The audit weighs planned spending very differently from impulse spending.
                </span>
              </span>
            </label>
          )}
        </div>
      </Modal>
      {confirmElement}
    </div>
  )
}

/* ==================================================================== *
 * Budgets
 * ==================================================================== */
function BudgetTab({ budgets, txns, reload }) {
  const { confirm, confirmElement } = useConfirm()
  const [cat, setCat] = useState('Groceries')
  const [cap, setCap] = useState('')

  const spentByCat = useMemo(() => {
    const start = monthStart()
    const m = {}
    txns.filter((t) => t.kind === 'EXPENSE' && t.txn_date >= start)
      .forEach((t) => { m[t.category] = (m[t.category] || 0) + num(t.amount) })
    return m
  }, [txns])

  async function add() {
    if (!cap) return
    await supabase.from('budgets').upsert(
      { category: cat, monthly_cap: Number(cap) }, { onConflict: 'hunter_id,category' })
    setCap(''); reload()
  }

  return (
    <div className="space-y-5">
      <Panel brackets>
        <PanelHeader eyebrow="Limits" title="Monthly budgets" />
        <div className="px-5 pb-5 space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <Field label="Category" className="flex-1 min-w-[160px]">
              <Select value={cat} onChange={(e) => setCat(e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Cap (₹)" className="w-32">
              <Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} />
            </Field>
            <Button variant="primary" icon={Plus} onClick={add} disabled={!cap}>Set</Button>
          </div>

          {budgets.length === 0 ? (
            <Empty icon={Target} title="No budgets set"
                   hint="Caps make overspending visible before the month ends." />
          ) : (
            <div className="space-y-3.5">
              {budgets.map((b) => {
                const used = spentByCat[b.category] || 0
                const p = pct(used, num(b.monthly_cap))
                const over = used > num(b.monthly_cap)
                return (
                  <div key={b.id} className="group">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-[13px] text-bone">{b.category}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px]">
                          <span className={over ? 'text-danger' : 'text-bone'}>{compact(used)}</span>
                          <span className="text-dim"> / {compact(b.monthly_cap)}</span>
                        </span>
                        <button
                          onClick={async () => {
                            if (await confirm({ title: 'Remove budget?', body: b.category })) {
                              await supabase.from('budgets').delete().eq('id', b.id); reload()
                            }
                          }}
                          className="p-0.5 text-dim opacity-0 group-hover:opacity-100 hover:text-danger transition-all"
                          aria-label="Remove budget">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <Bar value={p} max={100} tone={over ? 'danger' : p > 80 ? 'gold' : 'jade'} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Panel>
      {confirmElement}
    </div>
  )
}

/* ==================================================================== *
 * Portfolio — holdings, SIPs, options
 * ==================================================================== */
function PortfolioTab({ holdings, sips, options, reload }) {
  const { pushToast } = useSystem()
  const { confirm, confirmElement } = useConfirm()
  const [modal, setModal] = useState(null)
  const [f, setF] = useState({})
  const [busy, setBusy] = useState(false)

  const totals = useMemo(() => {
    let cost = 0, value = 0
    holdings.forEach((h) => {
      const q = num(h.quantity)
      cost += q * num(h.avg_cost)
      value += q * num(h.last_price ?? h.avg_cost)
    })
    return { cost, value, pnl: value - cost }
  }, [holdings])

  const optionPnl = options.reduce((a, o) => a + num(o.pnl), 0)
  const closedOptions = options.filter((o) => o.exit_price != null)
  const winRate = closedOptions.length
    ? Math.round((closedOptions.filter((o) => num(o.pnl) > 0).length / closedOptions.length) * 100) : null
  const disciplined = options.filter((o) => o.followed_plan === true).length
  const planRate = options.length ? Math.round((disciplined / options.length) * 100) : null

  async function save() {
    setBusy(true)
    try {
      if (modal === 'holding') {
        await supabase.from('holdings').insert({
          symbol: f.symbol?.toUpperCase(), name: f.name || null,
          asset_class: f.asset_class || 'EQUITY',
          quantity: Number(f.quantity || 0), avg_cost: Number(f.avg_cost || 0),
          last_price: f.last_price ? Number(f.last_price) : null,
          price_updated_at: f.last_price ? new Date().toISOString() : null,
        })
      } else if (modal === 'sip') {
        await supabase.from('sip_entries').insert({
          fund_name: f.fund_name, amount: Number(f.amount),
          units: f.units ? Number(f.units) : null, nav: f.nav ? Number(f.nav) : null,
          investment_date: f.investment_date || todayKey(),
        })
      } else if (modal === 'option') {
        const lots = Number(f.lots || 1), qty = Number(f.qty_per_lot || 1)
        const entry = Number(f.entry_price), exit = f.exit_price ? Number(f.exit_price) : null
        const dir = f.side === 'SELL' ? -1 : 1
        await supabase.from('options_trades').insert({
          underlying: f.underlying?.toUpperCase(), strike: f.strike ? Number(f.strike) : null,
          option_type: f.option_type || 'CE', side: f.side || 'BUY',
          lots, qty_per_lot: qty, entry_price: entry, exit_price: exit,
          trade_date: f.trade_date || todayKey(), exit_date: exit ? (f.exit_date || todayKey()) : null,
          pnl: exit != null ? (exit - entry) * dir * lots * qty : null,
          thesis: f.thesis || null,
          followed_plan: f.followed_plan === undefined ? null : !!f.followed_plan,
        })
      }
      setModal(null); setF({}); reload()
    } catch (e) {
      pushToast({ title: 'COULD NOT SAVE', body: e.message, severity: 'DANGER' })
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line">
        {[
          { label: 'Invested', value: inr(totals.cost), color: '#93A1B8' },
          { label: 'Value', value: inr(totals.value), color: '#3EC6FF' },
          { label: 'Unrealised', value: `${totals.pnl >= 0 ? '+' : ''}${inr(totals.pnl)}`,
            color: totals.pnl >= 0 ? '#34D399' : '#FF3B5C' },
          { label: 'Options P&L', value: `${optionPnl >= 0 ? '+' : ''}${inr(optionPnl)}`,
            color: optionPnl >= 0 ? '#34D399' : '#FF3B5C' },
        ].map((m) => (
          <div key={m.label} className="bg-abyss px-4 py-3.5">
            <div className="sys-eyebrow !text-[8px] mb-1.5">{m.label}</div>
            <div className="sys-num text-lg leading-none" style={{ color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      <Panel brackets>
        <PanelHeader eyebrow="Holdings" title="Portfolio"
          right={<Button size="sm" icon={Plus} onClick={() => { setModal('holding'); setF({ asset_class: 'EQUITY' }) }}>Add</Button>} />
        <div className="px-5 pb-5">
          {holdings.length === 0 ? (
            <Empty icon={TrendingUp} title="No holdings" hint="Add positions to track cost against value." />
          ) : (
            <div className="divide-y divide-line">
              {holdings.map((h) => {
                const q = num(h.quantity)
                const cost = q * num(h.avg_cost)
                const val = q * num(h.last_price ?? h.avg_cost)
                const pl = val - cost
                const plPct = cost > 0 ? (pl / cost) * 100 : 0
                return (
                  <div key={h.id} className="flex items-center gap-3 py-3 group">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-display text-[13px] text-bone truncate">{h.symbol}</p>
                        <Chip>{h.asset_class}</Chip>
                      </div>
                      <p className="font-mono text-[10px] text-dim mt-1">
                        {q} @ {inr(h.avg_cost)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="sys-num text-[13px] text-bone">{inr(val)}</p>
                      <p className={cn('font-mono text-[10px] mt-0.5',
                        pl >= 0 ? 'text-jade' : 'text-danger')}>
                        {pl >= 0 ? '+' : ''}{plPct.toFixed(1)}%
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        if (await confirm({ title: 'Remove holding?', body: h.symbol })) {
                          await supabase.from('holdings').delete().eq('id', h.id); reload()
                        }
                      }}
                      className="shrink-0 p-1 text-dim opacity-0 group-hover:opacity-100 hover:text-danger transition-all"
                      aria-label="Remove">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-5">
        <Panel>
          <PanelHeader eyebrow="Recurring" title="SIPs"
            right={<Button size="sm" icon={Plus} onClick={() => { setModal('sip'); setF({}) }}>Add</Button>} />
          <div className="px-5 pb-5">
            {sips.length === 0 ? (
              <Empty icon={Repeat} title="No SIP entries" hint="Log each instalment as it goes out." />
            ) : (
              <div className="divide-y divide-line max-h-72 overflow-y-auto">
                {sips.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-bone truncate">{s.fund_name}</p>
                      <p className="font-mono text-[10px] text-dim mt-0.5">
                        {s.investment_date}{s.nav ? ` · NAV ${num(s.nav).toFixed(2)}` : ''}
                      </p>
                    </div>
                    <span className="sys-num text-[13px] text-mana shrink-0">{inr(s.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader eyebrow="Derivatives" title="Options"
            right={<Button size="sm" icon={Plus} onClick={() => { setModal('option'); setF({ side: 'BUY', option_type: 'CE', lots: 1, qty_per_lot: 1 }) }}>Add</Button>} />
          <div className="px-5 pb-5">
            {options.length === 0 ? (
              <Empty icon={LineIcon} title="No trades logged"
                     hint="The audit cares far more about whether you followed your plan than about the P&L." />
            ) : (
              <>
                {(winRate != null || planRate != null) && (
                  <div className="grid grid-cols-2 gap-px bg-line border border-line mb-4">
                    <div className="bg-abyss px-3 py-2.5 text-center">
                      <div className="sys-eyebrow justify-center !text-[8px] mb-1">Win rate</div>
                      <div className="sys-num text-lg text-bone">{winRate ?? '—'}%</div>
                    </div>
                    <div className="bg-abyss px-3 py-2.5 text-center">
                      <div className="sys-eyebrow justify-center !text-[8px] mb-1">Plan followed</div>
                      <div className={cn('sys-num text-lg',
                        planRate == null ? 'text-dim' : planRate >= 70 ? 'text-jade' : 'text-danger')}>
                        {planRate ?? '—'}%
                      </div>
                    </div>
                  </div>
                )}
                <div className="divide-y divide-line max-h-60 overflow-y-auto">
                  {options.map((o) => (
                    <div key={o.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-bone truncate">
                          {o.underlying} {o.strike} {o.option_type}
                          <span className="ml-1.5 font-mono text-[10px] text-dim">{o.side}</span>
                        </p>
                        <p className="font-mono text-[10px] text-dim mt-0.5">
                          {o.trade_date}
                          {o.followed_plan === false && (
                            <span className="text-danger ml-2">OFF-PLAN</span>
                          )}
                        </p>
                      </div>
                      {o.pnl != null && (
                        <span className={cn('sys-num text-[13px] shrink-0',
                          num(o.pnl) >= 0 ? 'text-jade' : 'text-danger')}>
                          {num(o.pnl) >= 0 ? '+' : ''}{inr(o.pnl)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Panel>
      </div>

      {/* ---- add modals ---- */}
      <Modal open={!!modal} onClose={() => setModal(null)}
             eyebrow="Portfolio"
             title={modal === 'holding' ? 'Add holding' : modal === 'sip' ? 'Add SIP entry' : 'Log option trade'}
             footer={
               <>
                 <Button size="sm" onClick={() => setModal(null)} disabled={busy}>Cancel</Button>
                 <Button size="sm" variant="primary" loading={busy} onClick={save}>Save</Button>
               </>
             }>
        {modal === 'holding' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Symbol">
                <Input autoFocus value={f.symbol || ''} placeholder="INFY"
                       onChange={(e) => setF({ ...f, symbol: e.target.value })} />
              </Field>
              <Field label="Asset class">
                <Select value={f.asset_class} onChange={(e) => setF({ ...f, asset_class: e.target.value })}>
                  {ASSET_CLASSES.map((a) => <option key={a} value={a}>{a}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Name">
              <Input value={f.name || ''} placeholder="Optional"
                     onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Quantity">
                <Input type="number" step="any" value={f.quantity || ''}
                       onChange={(e) => setF({ ...f, quantity: e.target.value })} />
              </Field>
              <Field label="Avg cost">
                <Input type="number" step="any" value={f.avg_cost || ''}
                       onChange={(e) => setF({ ...f, avg_cost: e.target.value })} />
              </Field>
              <Field label="Last price">
                <Input type="number" step="any" value={f.last_price || ''}
                       onChange={(e) => setF({ ...f, last_price: e.target.value })} />
              </Field>
            </div>
          </div>
        )}

        {modal === 'sip' && (
          <div className="space-y-4">
            <Field label="Fund">
              <Input autoFocus value={f.fund_name || ''}
                     onChange={(e) => setF({ ...f, fund_name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Amount (₹)">
                <Input type="number" value={f.amount || ''}
                       onChange={(e) => setF({ ...f, amount: e.target.value })} />
              </Field>
              <Field label="Date">
                <Input type="date" value={f.investment_date || todayKey()}
                       onChange={(e) => setF({ ...f, investment_date: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Units"><Input type="number" step="any" value={f.units || ''}
                     onChange={(e) => setF({ ...f, units: e.target.value })} /></Field>
              <Field label="NAV"><Input type="number" step="any" value={f.nav || ''}
                     onChange={(e) => setF({ ...f, nav: e.target.value })} /></Field>
            </div>
          </div>
        )}

        {modal === 'option' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Underlying">
                <Input autoFocus value={f.underlying || ''} placeholder="NIFTY"
                       onChange={(e) => setF({ ...f, underlying: e.target.value })} />
              </Field>
              <Field label="Strike">
                <Input type="number" value={f.strike || ''}
                       onChange={(e) => setF({ ...f, strike: e.target.value })} />
              </Field>
              <Field label="Type">
                <Select value={f.option_type} onChange={(e) => setF({ ...f, option_type: e.target.value })}>
                  <option value="CE">CE</option><option value="PE">PE</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Side">
                <Select value={f.side} onChange={(e) => setF({ ...f, side: e.target.value })}>
                  <option value="BUY">Buy</option><option value="SELL">Sell</option>
                </Select>
              </Field>
              <Field label="Lots">
                <Input type="number" value={f.lots || 1}
                       onChange={(e) => setF({ ...f, lots: e.target.value })} />
              </Field>
              <Field label="Qty / lot">
                <Input type="number" value={f.qty_per_lot || 1}
                       onChange={(e) => setF({ ...f, qty_per_lot: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Entry price">
                <Input type="number" step="any" value={f.entry_price || ''}
                       onChange={(e) => setF({ ...f, entry_price: e.target.value })} />
              </Field>
              <Field label="Exit price" hint="Leave blank if still open.">
                <Input type="number" step="any" value={f.exit_price || ''}
                       onChange={(e) => setF({ ...f, exit_price: e.target.value })} />
              </Field>
            </div>
            <Field label="Thesis">
              <Textarea rows={2} value={f.thesis || ''} placeholder="Why you took it."
                        onChange={(e) => setF({ ...f, thesis: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={!!f.followed_plan} className="accent-[#3EC6FF] w-4 h-4"
                     onChange={(e) => setF({ ...f, followed_plan: e.target.checked })} />
              <span className="text-[13px] text-ash">I followed my plan on this one</span>
            </label>
          </div>
        )}
      </Modal>
      {confirmElement}
    </div>
  )
}

/* ==================================================================== *
 * Savings goals
 * ==================================================================== */
function SavingsTab({ goals, reload }) {
  const { confirm, confirmElement } = useConfirm()
  const [f, setF] = useState({ name: '', target_amount: '', target_date: '' })
  const [open, setOpen] = useState(false)

  async function add() {
    if (!f.name || !f.target_amount) return
    await supabase.from('savings_goals').insert({
      name: f.name, target_amount: Number(f.target_amount),
      target_date: f.target_date || null,
    })
    setF({ name: '', target_amount: '', target_date: '' }); setOpen(false); reload()
  }

  return (
    <div className="space-y-5">
      <Panel brackets>
        <PanelHeader eyebrow="Targets" title="Savings goals"
          right={<Button size="sm" variant="primary" icon={Plus} onClick={() => setOpen(true)}>Add</Button>} />
        <div className="px-5 pb-5">
          {goals.length === 0 ? (
            <Empty icon={PiggyBank} title="No savings goals"
                   hint="Name the thing you're saving for. Abstract saving rarely survives contact with a sale." />
          ) : (
            <div className="space-y-5">
              {goals.map((g) => {
                const p = pct(num(g.saved_amount), num(g.target_amount))
                return (
                  <div key={g.id} className="group">
                    <div className="flex items-baseline justify-between mb-1.5 gap-3">
                      <span className="text-[13.5px] text-bone truncate">{g.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[11px]">
                          <span className="text-mana">{compact(g.saved_amount)}</span>
                          <span className="text-dim"> / {compact(g.target_amount)}</span>
                        </span>
                        <button
                          onClick={async () => {
                            if (await confirm({ title: 'Delete goal?', body: g.name })) {
                              await supabase.from('savings_goals').delete().eq('id', g.id); reload()
                            }
                          }}
                          className="p-0.5 text-dim opacity-0 group-hover:opacity-100 hover:text-danger transition-all"
                          aria-label="Delete goal">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <Bar value={p} max={100} tone={p >= 100 ? 'jade' : 'mana'} />
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="font-mono text-[10px] text-dim">
                        {p}%{g.target_date ? ` · by ${g.target_date}` : ''}
                      </span>
                      <div className="flex gap-1">
                        {[1000, 5000, 10000].map((amt) => (
                          <button key={amt}
                            onClick={async () => {
                              await supabase.from('savings_goals')
                                .update({ saved_amount: num(g.saved_amount) + amt }).eq('id', g.id)
                              reload()
                            }}
                            className="px-2 py-0.5 border border-line font-mono text-[10px] text-dim hover:border-mana hover:text-mana transition-all">
                            +{compact(amt)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Panel>

      <Modal open={open} onClose={() => setOpen(false)} eyebrow="Savings" title="New goal"
        footer={
          <>
            <Button size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={add}
                    disabled={!f.name || !f.target_amount}>Create</Button>
          </>
        }>
        <div className="space-y-4">
          <Field label="What for?">
            <Input autoFocus value={f.name} placeholder="Emergency fund"
                   onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Target (₹)">
              <Input type="number" value={f.target_amount}
                     onChange={(e) => setF({ ...f, target_amount: e.target.value })} />
            </Field>
            <Field label="By when">
              <Input type="date" value={f.target_date} min={todayKey()}
                     onChange={(e) => setF({ ...f, target_date: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>
      {confirmElement}
    </div>
  )
}

/* ==================================================================== *
 * Finance page
 * ==================================================================== */
export default function FinancePage() {
  const { pushToast, reload: reloadSystem } = useSystem()
  const [tab, setTab] = useState('flow')
  const [data, setData] = useState(null)
  const [audit, setAudit] = useState(null)
  const [auditing, setAuditing] = useState(false)

  const load = useCallback(async () => {
    const [t, b, h, s, sip, o, a] = await Promise.all([
      supabase.from('transactions').select('*').order('txn_date', { ascending: false }).limit(400),
      supabase.from('budgets').select('*').order('category'),
      supabase.from('holdings').select('*').order('symbol'),
      supabase.from('savings_goals').select('*').order('created_at', { ascending: false }),
      supabase.from('sip_entries').select('*').order('investment_date', { ascending: false }).limit(60),
      supabase.from('options_trades').select('*').order('trade_date', { ascending: false }).limit(60),
      supabase.from('finance_audits').select('*').order('created_at', { ascending: false }).limit(1),
    ])
    setData({
      txns: t.data || [], budgets: b.data || [], holdings: h.data || [],
      savings: s.data || [], sips: sip.data || [], options: o.data || [],
    })
    if (a.data?.[0]) setAudit({ data: a.data[0], stored: true })
  }, [])

  useEffect(() => { load() }, [load])

  async function runAudit() {
    setAuditing(true)
    try {
      const r = await ai('finance_audit', {})
      setAudit({ ...r, data: { ...r.data, discipline_score: r.data?.discipline_score } })
      if (r.degraded) pushToast({ title: 'REDUCED CAPACITY', body: r.reason, severity: 'WARN' })
      reloadSystem()
    } catch (e) {
      pushToast({ title: 'AUDIT FAILED', body: e.message, severity: 'DANGER' })
    } finally { setAuditing(false) }
  }

  if (!data) return <Loading label="Loading finances" />

  const score = num(audit?.data?.discipline_score)

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="sys-eyebrow mb-1.5">Finance</div>
          <h1 className="font-display text-2xl text-bone leading-none">Perception</h1>
        </div>
        <Button variant="monarch" icon={Sparkles} loading={auditing} onClick={runAudit}>
          Run discipline audit
        </Button>
      </div>

      {audit?.data && (
        <Panel tone="monarch" brackets>
          <div className="p-5">
            <div className="flex items-start gap-5 flex-wrap">
              <div className="shrink-0">
                <div className="sys-eyebrow !text-monarch mb-2">Discipline</div>
                <div className="sys-num text-4xl leading-none"
                     style={{ color: score >= 70 ? '#34D399' : score >= 45 ? '#F5C542' : '#FF3B5C' }}>
                  {Math.round(score)}
                  <span className="text-sm text-dim">/100</span>
                </div>
              </div>
              <div className="min-w-[240px] flex-1">
                <DegradedNote reason={audit.degraded ? audit.reason : null} />
                {audit.data.verdict && (
                  <p className="text-[13.5px] text-bone leading-relaxed">{audit.data.verdict}</p>
                )}
              </div>
            </div>

            {audit.data.leaks?.length > 0 && (
              <div className="mt-5 pt-4 border-t border-line">
                <p className="sys-eyebrow mb-2.5 flex items-center gap-2">
                  <ShieldAlert size={11} /> Leaks
                </p>
                <div className="space-y-2">
                  {audit.data.leaks.map((l, i) => (
                    <div key={i} className="flex gap-2.5">
                      <span className="text-danger shrink-0">▸</span>
                      <p className="text-[12.5px] text-ash leading-snug">
                        {typeof l === 'string' ? l : `${l.category}: ${l.note ?? ''}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {audit.data.directives?.length > 0 && (
              <div className="mt-4">
                <p className="sys-eyebrow mb-2.5">Directives</p>
                <div className="space-y-2">
                  {audit.data.directives.map((d, i) => (
                    <div key={i} className="flex gap-2.5">
                      <span className="sys-num text-[11px] text-monarch shrink-0">{i + 1}</span>
                      <p className="text-[12.5px] text-ash leading-snug">{d}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Panel>
      )}

      <Tabs value={tab} onChange={setTab} tabs={[
        { key: 'flow', label: 'Cash flow' },
        { key: 'budgets', label: 'Budgets', badge: data.budgets.length },
        { key: 'portfolio', label: 'Portfolio' },
        { key: 'savings', label: 'Savings', badge: data.savings.length },
      ]} />

      {tab === 'flow' && <TxnTab txns={data.txns} reload={load} />}
      {tab === 'budgets' && <BudgetTab budgets={data.budgets} txns={data.txns} reload={load} />}
      {tab === 'portfolio' && (
        <PortfolioTab holdings={data.holdings} sips={data.sips} options={data.options} reload={load} />
      )}
      {tab === 'savings' && <SavingsTab goals={data.savings} reload={load} />}
    </div>
  )
}
