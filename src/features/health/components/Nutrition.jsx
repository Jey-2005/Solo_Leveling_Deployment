import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  Search, Star, Plus, Trash2, Utensils, ChefHat, Target, Sparkles,
  Check, X, Droplets, MessageSquare,
} from 'lucide-react'
import supabase from '../../../config/supabase'
import { useSystem } from '../../../context/SystemContext'
import { ai } from '../../../lib/api'
import {
  Panel, PanelHeader, Button, Field, Input, Select, Textarea, Chip,
  Empty, Loading, Modal, Bar, Tabs, DegradedNote, useConfirm,
} from '../../../components/system'
import { MEAL_SLOTS } from '../../../data/system'
import { cn, todayKey, num, debounce, pct } from '../../../lib/utils'

const MACROS = [
  { key: 'energy_kcal', label: 'Energy',  unit: 'kcal', target: 'kcal',      color: '#3EC6FF' },
  { key: 'protein_g',   label: 'Protein', unit: 'g',    target: 'protein_g', color: '#FF3B5C' },
  { key: 'carb_g',      label: 'Carbs',   unit: 'g',    target: 'carb_g',    color: '#F5C542' },
  { key: 'fat_g',       label: 'Fat',     unit: 'g',    target: 'fat_g',     color: '#A78BFA' },
  { key: 'fibre_g',     label: 'Fibre',   unit: 'g',    target: 'fibre_g',   color: '#34D399' },
]

const scale = (v, grams) => Math.round(((num(v) * num(grams)) / 100) * 10) / 10

/* ==================================================================== *
 * Add-food dialog — one search box over the 1000-dish table, the
 * hunter's own foods, and their recipes.
 * ==================================================================== */
function AddFoodModal({ open, onClose, onLogged, defaultSlot }) {
  const { pushToast } = useSystem()
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState(null)
  const [grams, setGrams] = useState(100)
  const [slot, setSlot] = useState(defaultSlot || 'SNACK')
  const [busy, setBusy] = useState(false)
  const [favs, setFavs] = useState([])

  const run = useRef(debounce(async (text) => {
    if (!text.trim()) { setResults([]); setSearching(false); return }
    const { data } = await supabase.rpc('search_foods', { p_query: text, p_limit: 30 })
    setResults(data || [])
    setSearching(false)
  }, 260)).current

  useEffect(() => {
    if (!open) return
    supabase.rpc('search_foods', { p_query: '', p_limit: 24 }).then(({ data }) => setFavs(data || []))
  }, [open])

  useEffect(() => {
    setSearching(!!q.trim())
    run(q)
  }, [q, run])

  useEffect(() => { if (open) { setQ(''); setPicked(null); setGrams(100); setSlot(defaultSlot || 'SNACK') } }, [open, defaultSlot])

  async function toggleFav(item) {
    if (item.source !== 'DB') return
    if (item.is_favorite) {
      await supabase.from('food_favorites').delete().eq('food_id', Number(item.id))
    } else {
      await supabase.from('food_favorites').insert({ food_id: Number(item.id) })
    }
    const patch = (list) => list.map((x) =>
      x.source === item.source && x.id === item.id ? { ...x, is_favorite: !x.is_favorite } : x)
    setResults(patch); setFavs(patch)
  }

  async function log() {
    if (!picked) return
    setBusy(true)
    try {
      const row = {
        log_date: todayKey(),
        slot,
        label: picked.name,
        grams: Number(grams),
        energy_kcal: scale(picked.energy_kcal, grams),
        carb_g: scale(picked.carb_g, grams),
        protein_g: scale(picked.protein_g, grams),
        fat_g: scale(picked.fat_g, grams),
        fibre_g: scale(picked.fibre_g, grams),
        food_id: picked.source === 'DB' ? Number(picked.id) : null,
        custom_food_id: picked.source === 'CUSTOM' ? picked.id : null,
        recipe_id: picked.source === 'RECIPE' ? picked.id : null,
      }
      const { error } = await supabase.from('food_logs').insert(row)
      if (error) throw error
      onLogged?.()
      onClose()
    } catch (e) {
      pushToast({ title: 'COULD NOT LOG', body: e.message, severity: 'DANGER' })
    } finally {
      setBusy(false)
    }
  }

  const list = q.trim() ? results : favs

  return (
    <Modal
      open={open} onClose={onClose} wide
      eyebrow="Nutrition" title="Add food"
      footer={picked && (
        <>
          <Button size="sm" onClick={() => setPicked(null)} disabled={busy}>Back</Button>
          <Button size="sm" variant="primary" icon={Check} loading={busy} onClick={log}>Log it</Button>
        </>
      )}
    >
      {!picked ? (
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} className="pl-9"
                   placeholder="Search 1,000+ dishes, your foods and recipes" />
          </div>

          {!q.trim() && (
            <p className="sys-eyebrow">{favs.length ? 'Favourites & your foods' : 'Start typing'}</p>
          )}

          <div className="max-h-[52vh] overflow-y-auto -mx-1 px-1">
            {searching ? <Loading label="Searching" className="!py-8" />
              : list.length === 0 ? (
                <Empty icon={Utensils} title={q.trim() ? 'Nothing matched' : 'No favourites yet'}
                       hint={q.trim() ? 'Try a shorter word — the search tolerates typos.' : 'Star foods you eat often and they appear here.'} />
              ) : (
                <div className="divide-y divide-line">
                  {list.map((f) => (
                    <div key={`${f.source}-${f.id}`} className="flex items-center gap-3 py-2.5 group">
                      <button onClick={() => setPicked(f)} className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] text-bone truncate">{f.name}</p>
                          {f.source !== 'DB' && (
                            <Chip tone={f.source === 'RECIPE' ? 'monarch' : 'mana'}>
                              {f.source === 'RECIPE' ? 'Recipe' : 'Yours'}
                            </Chip>
                          )}
                        </div>
                        <p className="font-mono text-[10px] text-dim mt-1">
                          {Math.round(num(f.energy_kcal))} kcal · P {num(f.protein_g).toFixed(1)} ·
                          {' '}C {num(f.carb_g).toFixed(1)} · F {num(f.fat_g).toFixed(1)}
                          <span className="text-dim/60"> / 100 g</span>
                        </p>
                      </button>
                      {f.source === 'DB' && (
                        <button onClick={() => toggleFav(f)} aria-label="Favourite"
                          className={cn('shrink-0 p-1.5 transition-colors',
                            f.is_favorite ? 'text-gold' : 'text-dim hover:text-gold')}>
                          <Star size={14} fill={f.is_favorite ? 'currentColor' : 'none'} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="border-l-2 border-mana pl-3.5 py-1">
            <p className="text-[15px] text-bone">{picked.name}</p>
            <p className="font-mono text-[10px] text-dim mt-1">per 100 g</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount (g)">
              <Input type="number" inputMode="decimal" autoFocus value={grams} min="1"
                     onChange={(e) => setGrams(e.target.value)} />
            </Field>
            <Field label="Meal">
              <Select value={slot} onChange={(e) => setSlot(e.target.value)}>
                {MEAL_SLOTS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </Select>
            </Field>
          </div>

          <div className="flex gap-1.5">
            {[50, 100, 150, 200, 250].map((g) => (
              <button key={g} onClick={() => setGrams(g)}
                className={cn('flex-1 py-1.5 border font-mono text-[11px] transition-all',
                  Number(grams) === g ? 'border-mana text-mana bg-mana/10' : 'border-line text-dim hover:border-line-lit')}>
                {g}g
              </button>
            ))}
          </div>

          <div className="grid grid-cols-5 gap-px bg-line border border-line">
            {MACROS.map((m) => (
              <div key={m.key} className="bg-abyss px-2 py-2.5 text-center">
                <div className="sys-eyebrow justify-center !text-[8px] mb-1">{m.label}</div>
                <div className="sys-num text-[15px]" style={{ color: m.color }}>
                  {scale(picked[m.key], grams)}
                </div>
                <div className="font-mono text-[8px] text-dim">{m.unit}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ==================================================================== *
 * Recipe builder — ingredients priced per 100 g, macros recomputed by
 * a Postgres trigger so the numbers can never drift from the parts.
 * ==================================================================== */
function RecipeModal({ open, onClose, recipe, onSaved }) {
  const { pushToast } = useSystem()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [yieldG, setYieldG] = useState(500)
  const [items, setItems] = useState([])
  const [manual, setManual] = useState(false)
  const [macros, setMacros] = useState({ energy_kcal: '', protein_g: '', carb_g: '', fat_g: '', fibre_g: '' })
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)

  const run = useRef(debounce(async (text) => {
    if (!text.trim()) { setResults([]); return }
    const { data } = await supabase.rpc('search_foods', { p_query: text, p_limit: 15 })
    setResults((data || []).filter((d) => d.source !== 'RECIPE'))
  }, 260)).current

  useEffect(() => { run(q) }, [q, run])

  useEffect(() => {
    if (!open) return
    if (recipe) {
      setName(recipe.name); setDesc(recipe.description || '')
      setYieldG(recipe.total_yield_g); setManual(recipe.manual_macros)
      setMacros({
        energy_kcal: recipe.energy_kcal, protein_g: recipe.protein_g,
        carb_g: recipe.carb_g, fat_g: recipe.fat_g, fibre_g: recipe.fibre_g,
      })
      supabase.from('recipe_ingredients').select('*').eq('recipe_id', recipe.id)
        .order('sort_order').then(({ data }) => setItems((data || []).map((d) => ({ ...d, key: d.id }))))
    } else {
      setName(''); setDesc(''); setYieldG(500); setItems([]); setManual(false)
      setMacros({ energy_kcal: '', protein_g: '', carb_g: '', fat_g: '', fibre_g: '' })
    }
    setQ(''); setResults([])
  }, [open, recipe])

  const totals = useMemo(() => {
    const t = { energy_kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0, fibre_g: 0, grams: 0 }
    items.forEach((it) => {
      t.grams += num(it.grams)
      MACROS.forEach((m) => { t[m.key] += num(it[m.key]) })
    })
    return t
  }, [items])

  function addIngredient(f) {
    setItems((prev) => [...prev, {
      key: crypto.randomUUID(),
      food_id: f.source === 'DB' ? Number(f.id) : null,
      custom_food_id: f.source === 'CUSTOM' ? f.id : null,
      label: f.name,
      grams: 100,
      per100: f,
      energy_kcal: num(f.energy_kcal), protein_g: num(f.protein_g),
      carb_g: num(f.carb_g), fat_g: num(f.fat_g), fibre_g: num(f.fibre_g),
    }])
    setQ(''); setResults([])
  }

  function setGrams(i, g) {
    setItems((prev) => prev.map((it, j) => {
      if (j !== i) return it
      const base = it.per100 || {
        energy_kcal: (num(it.energy_kcal) * 100) / Math.max(1, num(it.grams)),
        protein_g: (num(it.protein_g) * 100) / Math.max(1, num(it.grams)),
        carb_g: (num(it.carb_g) * 100) / Math.max(1, num(it.grams)),
        fat_g: (num(it.fat_g) * 100) / Math.max(1, num(it.grams)),
        fibre_g: (num(it.fibre_g) * 100) / Math.max(1, num(it.grams)),
      }
      return {
        ...it, grams: g, per100: base,
        energy_kcal: scale(base.energy_kcal, g), protein_g: scale(base.protein_g, g),
        carb_g: scale(base.carb_g, g), fat_g: scale(base.fat_g, g), fibre_g: scale(base.fibre_g, g),
      }
    }))
  }

  async function save() {
    if (name.trim().length < 2) return
    setBusy(true)
    try {
      const payload = {
        name: name.trim(), description: desc || null,
        total_yield_g: Number(yieldG) || totals.grams || 100,
        manual_macros: manual,
        ...(manual ? Object.fromEntries(MACROS.map((m) => [m.key, num(macros[m.key])])) : {}),
      }

      let id = recipe?.id
      if (id) {
        await supabase.from('recipes').update(payload).eq('id', id)
        await supabase.from('recipe_ingredients').delete().eq('recipe_id', id)
      } else {
        const { data, error } = await supabase.from('recipes').insert(payload).select().single()
        if (error) throw error
        id = data.id
      }

      if (items.length) {
        await supabase.from('recipe_ingredients').insert(items.map((it, i) => ({
          recipe_id: id,
          food_id: it.food_id, custom_food_id: it.custom_food_id,
          label: it.label, grams: num(it.grams),
          energy_kcal: num(it.energy_kcal), protein_g: num(it.protein_g),
          carb_g: num(it.carb_g), fat_g: num(it.fat_g), fibre_g: num(it.fibre_g),
          sort_order: i,
        })))
      }

      pushToast({ title: 'RECIPE SAVED', body: name.trim(), severity: 'OK' })
      onSaved?.(); onClose()
    } catch (e) {
      pushToast({ title: 'COULD NOT SAVE', body: e.message, severity: 'DANGER' })
    } finally {
      setBusy(false)
    }
  }

  const per100 = yieldG > 0
    ? Object.fromEntries(MACROS.map((m) => [m.key, Math.round((totals[m.key] / yieldG) * 100 * 10) / 10]))
    : {}

  return (
    <Modal
      open={open} onClose={onClose} wide
      eyebrow={recipe ? 'Edit recipe' : 'New recipe'}
      title={name || 'Untitled recipe'}
      footer={
        <>
          <Button size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" variant="primary" icon={Check} loading={busy}
                  disabled={name.trim().length < 2} onClick={save}>Save recipe</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-[1fr_140px] gap-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunday chicken curry" />
          </Field>
          <Field label="Total yield (g)" hint="Cooked weight.">
            <Input type="number" value={yieldG} onChange={(e) => setYieldG(e.target.value)} />
          </Field>
        </div>

        <Field label="Notes">
          <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)}
                    placeholder="Optional method or serving note." />
        </Field>

        <label className="flex items-center gap-2.5 cursor-pointer py-1">
          <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)}
                 className="accent-[#3EC6FF] w-4 h-4" />
          <span className="text-[13px] text-ash">
            Enter macros directly instead of from ingredients
          </span>
        </label>

        {manual ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {MACROS.map((m) => (
              <Field key={m.key} label={`${m.label} /100g`}>
                <Input type="number" step="0.1" value={macros[m.key]}
                       onChange={(e) => setMacros({ ...macros, [m.key]: e.target.value })} />
              </Field>
            ))}
          </div>
        ) : (
          <>
            <div className="border-t border-line pt-4">
              <p className="sys-eyebrow mb-3">Ingredients</p>

              {items.length > 0 && (
                <div className="divide-y divide-line mb-3">
                  {items.map((it, i) => (
                    <div key={it.key} className="flex items-center gap-2.5 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-bone truncate">{it.label}</p>
                        <p className="font-mono text-[10px] text-dim mt-0.5">
                          {Math.round(num(it.energy_kcal))} kcal · P {num(it.protein_g).toFixed(1)}
                        </p>
                      </div>
                      <Input type="number" value={it.grams} className="!w-20 !py-1.5 !text-[13px] text-right"
                             onChange={(e) => setGrams(i, e.target.value)} />
                      <span className="font-mono text-[10px] text-dim">g</span>
                      <button onClick={() => setItems(items.filter((_, j) => j !== i))}
                              className="p-1 text-dim hover:text-danger transition-colors" aria-label="Remove">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-9"
                       placeholder="Add an ingredient" />
              </div>

              {results.length > 0 && (
                <div className="mt-1.5 border border-line max-h-44 overflow-y-auto">
                  {results.map((f) => (
                    <button key={`${f.source}-${f.id}`} onClick={() => addIngredient(f)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-mana/[0.07] transition-colors">
                      <span className="text-[13px] text-ash truncate">{f.name}</span>
                      <span className="font-mono text-[10px] text-dim shrink-0">
                        {Math.round(num(f.energy_kcal))} kcal
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="border border-line">
                <div className="px-3 py-2 border-b border-line flex items-center justify-between">
                  <span className="sys-eyebrow">Per 100 g</span>
                  <span className="font-mono text-[10px] text-dim">
                    {Math.round(totals.grams)} g in · {yieldG} g out
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-px bg-line">
                  {MACROS.map((m) => (
                    <div key={m.key} className="bg-abyss px-2 py-2.5 text-center">
                      <div className="sys-eyebrow justify-center !text-[8px] mb-1">{m.label}</div>
                      <div className="sys-num text-[15px]" style={{ color: m.color }}>{per100[m.key] ?? 0}</div>
                    </div>
                  ))}
                </div>
                {Math.abs(totals.grams - num(yieldG)) > totals.grams * 0.35 && totals.grams > 0 && (
                  <p className="px-3 py-2 text-[11px] text-gold border-t border-line leading-snug">
                    Ingredients weigh {Math.round(totals.grams)} g but yield is set to {yieldG} g. That is a
                    large gap — reasonable if a lot of water cooks off, worth checking otherwise.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

/* ==================================================================== *
 * Nutrition page
 * ==================================================================== */
export default function Nutrition() {
  const { targets, reload, pushToast } = useSystem()
  const { confirm, confirmElement } = useConfirm()

  const [tab, setTab] = useState('today')
  const [logs, setLogs] = useState(null)
  const [recipes, setRecipes] = useState([])
  const [customs, setCustoms] = useState([])
  const [date, setDate] = useState(todayKey())
  const [addOpen, setAddOpen] = useState(false)
  const [addSlot, setAddSlot] = useState('SNACK')
  const [recipeOpen, setRecipeOpen] = useState(false)
  const [editRecipe, setEditRecipe] = useState(null)
  const [coach, setCoach] = useState(null)
  const [coaching, setCoaching] = useState(false)
  const [quick, setQuick] = useState('')
  const [parsing, setParsing] = useState(false)

  // editable targets
  const [tForm, setTForm] = useState(null)
  const [savingT, setSavingT] = useState(false)

  const load = useCallback(async () => {
    const [l, r, c] = await Promise.all([
      supabase.from('food_logs').select('*').eq('log_date', date).order('logged_at'),
      supabase.from('recipes').select('*').order('created_at', { ascending: false }),
      supabase.from('custom_foods').select('*').order('created_at', { ascending: false }),
    ])
    setLogs(l.data || []); setRecipes(r.data || []); setCustoms(c.data || [])
  }, [date])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (targets) setTForm(targets) }, [targets])

  const totals = useMemo(() => {
    const t = Object.fromEntries(MACROS.map((m) => [m.key, 0]))
    ;(logs || []).forEach((l) => MACROS.forEach((m) => { t[m.key] += num(l[m.key]) }))
    return t
  }, [logs])

  const bySlot = useMemo(() => {
    const g = Object.fromEntries(MEAL_SLOTS.map((s) => [s.key, []]))
    ;(logs || []).forEach((l) => { (g[l.slot] ||= []).push(l) })
    return g
  }, [logs])

  async function removeLog(id) {
    await supabase.from('food_logs').delete().eq('id', id)
    load()
  }

  async function saveTargets() {
    setSavingT(true)
    try {
      await supabase.from('nutrition_targets').upsert({
        ...tForm, auto_from_report: false,
      }, { onConflict: 'hunter_id' })
      pushToast({ title: 'TARGETS UPDATED', severity: 'OK' })
      await reload()
    } finally { setSavingT(false) }
  }

  async function runCoach() {
    setCoaching(true)
    try {
      const r = await ai('nutrition_coach', { date })
      setCoach(r)
    } catch (e) {
      pushToast({ title: 'UNAVAILABLE', body: e.message, severity: 'DANGER' })
    } finally { setCoaching(false) }
  }

  async function parseQuick() {
    if (quick.trim().length < 3) return
    setParsing(true)
    try {
      const r = await ai('parse_meal', {
        text: quick.trim(),
        time_of_day: new Date().getHours(),
      })
      const rows = (r.data?.items || []).map((it) => ({
        log_date: date,
        slot: MEAL_SLOTS.some((s) => s.key === r.data?.slot) ? r.data.slot : 'SNACK',
        label: it.name,
        grams: num(it.grams, 100),
        energy_kcal: num(it.energy_kcal), carb_g: num(it.carb_g),
        protein_g: num(it.protein_g), fat_g: num(it.fat_g), fibre_g: num(it.fibre_g),
      }))
      if (!rows.length) throw new Error('Nothing recognisable in that.')
      await supabase.from('food_logs').insert(rows)
      pushToast({
        title: r.degraded ? 'LOGGED (ESTIMATE)' : 'MEAL LOGGED',
        body: `${rows.length} item${rows.length === 1 ? '' : 's'} added`,
        severity: r.degraded ? 'WARN' : 'OK',
      })
      setQuick(''); load()
    } catch (e) {
      pushToast({ title: 'COULD NOT PARSE', body: e.message, severity: 'DANGER' })
    } finally { setParsing(false) }
  }

  if (logs === null) return <Loading label="Loading nutrition" />

  return (
    <div className="space-y-5">
      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { key: 'today', label: 'Log' },
          { key: 'recipes', label: 'Recipes', badge: recipes.length },
          { key: 'targets', label: 'Targets' },
        ]}
      />

      {/* ------------------------------ LOG ------------------------------ */}
      {tab === 'today' && (
        <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
          <div className="space-y-4 min-w-0">
            <Panel brackets>
              <PanelHeader
                eyebrow="Intake"
                title={date === todayKey() ? 'Today' : date}
                right={
                  <Input type="date" value={date} max={todayKey()} className="!py-1.5 !text-[12px] !w-auto"
                         onChange={(e) => setDate(e.target.value)} />
                }
              />

              <div className="px-5 pb-4 space-y-3">
                {MACROS.map((m) => {
                  const have = Math.round(totals[m.key])
                  const want = Math.round(num(targets?.[m.target]))
                  const over = want > 0 && have > want * 1.05
                  return (
                    <div key={m.key}>
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="font-display text-[11px] uppercase tracking-[0.12em] text-ash">
                          {m.label}
                        </span>
                        <span className="font-mono text-[11px]">
                          <span style={{ color: over ? '#FF3B5C' : m.color }}>{have}</span>
                          <span className="text-dim"> / {want} {m.unit}</span>
                        </span>
                      </div>
                      <div className="sys-bar">
                        <div className="sys-bar__fill" style={{
                          width: `${pct(have, want || 1)}%`,
                          background: `linear-gradient(90deg, ${m.color}66, ${m.color})`,
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Panel>

            {/* quick natural-language logging */}
            <Panel>
              <div className="p-4">
                <div className="sys-eyebrow mb-2.5 flex items-center gap-2">
                  <Sparkles size={11} /> Describe a meal
                </div>
                <div className="flex gap-2">
                  <Input value={quick} onChange={(e) => setQuick(e.target.value)}
                         onKeyDown={(e) => e.key === 'Enter' && parseQuick()}
                         placeholder="two rotis, dal, half a bowl of curd" />
                  <Button variant="primary" loading={parsing} onClick={parseQuick}>Log</Button>
                </div>
                <p className="text-[11px] text-dim mt-2 leading-snug">
                  Estimated portions. Search for exact entries when precision matters.
                </p>
              </div>
            </Panel>

            {MEAL_SLOTS.map((s) => (
              <Panel key={s.key}>
                <PanelHeader
                  eyebrow={s.label}
                  title={`${Math.round((bySlot[s.key] || []).reduce((a, l) => a + num(l.energy_kcal), 0))} kcal`}
                  right={
                    <Button size="sm" icon={Plus}
                            onClick={() => { setAddSlot(s.key); setAddOpen(true) }}>Add</Button>
                  }
                />
                <div className="px-5 pb-4">
                  {(bySlot[s.key] || []).length === 0 ? (
                    <p className="text-[12px] text-dim py-1">Nothing logged.</p>
                  ) : (
                    <div className="divide-y divide-line">
                      {bySlot[s.key].map((l) => (
                        <div key={l.id} className="flex items-center gap-3 py-2 group">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] text-bone truncate">{l.label}</p>
                            <p className="font-mono text-[10px] text-dim mt-0.5">
                              {Math.round(num(l.grams))} g · P {num(l.protein_g).toFixed(1)} ·
                              {' '}C {num(l.carb_g).toFixed(1)} · F {num(l.fat_g).toFixed(1)}
                            </p>
                          </div>
                          <span className="sys-num text-[13px] text-mana shrink-0">
                            {Math.round(num(l.energy_kcal))}
                          </span>
                          <button onClick={() => removeLog(l.id)}
                            className="shrink-0 p-1 text-dim opacity-0 group-hover:opacity-100 hover:text-danger transition-all"
                            aria-label="Remove">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>
            ))}
          </div>

          <div className="space-y-4 lg:sticky lg:top-5">
            <Panel tone="monarch">
              <div className="p-4">
                <div className="sys-eyebrow mb-2 flex items-center gap-2">
                  <MessageSquare size={11} /> Nutrition review
                </div>
                <p className="text-[12.5px] text-ash leading-relaxed">
                  The System reads what you actually ate against your targets and says what it thinks.
                </p>
                <Button variant="monarch" size="sm" className="mt-3 w-full justify-center"
                        loading={coaching} onClick={runCoach}>
                  Request review
                </Button>

                {coach && (
                  <div className="mt-4 space-y-3">
                    <DegradedNote reason={coach.degraded ? coach.reason : null} />
                    {coach.data?.verdict && (
                      <p className="text-[13px] text-bone leading-relaxed">{coach.data.verdict}</p>
                    )}
                    {coach.data?.fixes?.length > 0 && (
                      <div className="space-y-2">
                        {coach.data.fixes.map((f, i) => (
                          <div key={i} className="flex gap-2.5">
                            <span className="sys-num text-[11px] text-monarch shrink-0">{i + 1}</span>
                            <p className="text-[12.5px] text-ash leading-snug">{f}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Panel>

            <Panel>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Droplets size={13} className="text-mana" />
                  <span className="sys-eyebrow">Water</span>
                </div>
                <p className="sys-num text-xl text-mana">
                  {((num(targets?.water_ml) || 3000) / 1000).toFixed(1)}
                  <span className="text-xs ml-1 text-dim">L target</span>
                </p>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* ---------------------------- RECIPES ---------------------------- */}
      {tab === 'recipes' && (
        <div className="space-y-4">
          <Panel brackets>
            <PanelHeader
              eyebrow="Your kitchen" title="Recipes"
              right={
                <Button size="sm" variant="primary" icon={Plus}
                        onClick={() => { setEditRecipe(null); setRecipeOpen(true) }}>
                  New recipe
                </Button>
              }
            />
            <div className="px-5 pb-5">
              {recipes.length === 0 ? (
                <Empty icon={ChefHat} title="No recipes yet"
                       hint="Build a recipe once from its ingredients and log it by weight from then on." />
              ) : (
                <div className="grid sm:grid-cols-2 gap-2">
                  {recipes.map((r) => (
                    <div key={r.id} className="p-3.5 border border-line group hover:border-line-lit transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <button onClick={() => { setEditRecipe(r); setRecipeOpen(true) }}
                                className="min-w-0 text-left flex-1">
                          <p className="text-[13.5px] text-bone truncate">{r.name}</p>
                          <p className="font-mono text-[10px] text-dim mt-1">
                            {Math.round(num(r.energy_kcal))} kcal · P {num(r.protein_g).toFixed(1)} /100 g
                          </p>
                        </button>
                        <button
                          onClick={async () => {
                            if (await confirm({ title: 'Delete recipe?', body: `“${r.name}” will be removed. Past logs keep their numbers.` })) {
                              await supabase.from('recipes').delete().eq('id', r.id); load()
                            }
                          }}
                          className="shrink-0 p-1 text-dim opacity-0 group-hover:opacity-100 hover:text-danger transition-all"
                          aria-label="Delete recipe">
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <p className="font-mono text-[9px] text-dim mt-2">YIELD {r.total_yield_g} g</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          {customs.length > 0 && (
            <Panel>
              <PanelHeader eyebrow="Custom" title="Your own foods" />
              <div className="px-5 pb-5 divide-y divide-line">
                {customs.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 py-2.5 group">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-bone truncate">{c.food_name}</p>
                      <p className="font-mono text-[10px] text-dim mt-0.5">
                        {Math.round(num(c.energy_kcal))} kcal /100 g
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        if (await confirm({ title: 'Delete food?', body: `“${c.food_name}” will be removed.` })) {
                          await supabase.from('custom_foods').delete().eq('id', c.id); load()
                        }
                      }}
                      className="shrink-0 p-1 text-dim opacity-0 group-hover:opacity-100 hover:text-danger transition-all"
                      aria-label="Delete food">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* ---------------------------- TARGETS ---------------------------- */}
      {tab === 'targets' && tForm && (
        <Panel brackets className="max-w-xl">
          <PanelHeader eyebrow="Your numbers" title="Daily targets" />
          <div className="px-5 pb-5 space-y-4">
            <p className="text-[12.5px] text-ash leading-relaxed">
              These were derived from your body report. Override any of them — the System will use
              your numbers instead and stop recalculating them automatically.
            </p>

            <div className="grid grid-cols-2 gap-4">
              {[
                ['kcal', 'Calories', 'kcal'],
                ['protein_g', 'Protein', 'g'],
                ['carb_g', 'Carbs', 'g'],
                ['fat_g', 'Fat', 'g'],
                ['fibre_g', 'Fibre', 'g'],
                ['water_ml', 'Water', 'ml'],
              ].map(([k, label, unit]) => (
                <Field key={k} label={`${label} (${unit})`}>
                  <Input type="number" value={tForm[k] ?? ''}
                         onChange={(e) => setTForm({ ...tForm, [k]: e.target.value })} />
                </Field>
              ))}
            </div>

            <Field label="Strategy">
              <Select value={tForm.strategy} onChange={(e) => setTForm({ ...tForm, strategy: e.target.value })}>
                <option value="CUT">Cut — lose fat</option>
                <option value="RECOMP">Recomp</option>
                <option value="MAINTAIN">Maintain</option>
                <option value="BULK">Bulk — gain</option>
              </Select>
            </Field>

            {num(tForm.kcal) > 0 && num(tForm.kcal) < 1200 && (
              <p className="text-[12px] text-danger border-l-2 border-danger pl-3 py-1 leading-snug">
                Below 1,200 kcal a day is very low and is not something to attempt without medical
                supervision. Please reconsider, or talk to a doctor or dietitian first.
              </p>
            )}

            <Button variant="primary" icon={Target} loading={savingT} onClick={saveTargets}>
              Save targets
            </Button>
          </div>
        </Panel>
      )}

      <AddFoodModal open={addOpen} onClose={() => setAddOpen(false)}
                    defaultSlot={addSlot} onLogged={load} />
      <RecipeModal open={recipeOpen} onClose={() => setRecipeOpen(false)}
                   recipe={editRecipe} onSaved={load} />
      {confirmElement}
    </div>
  )
}
