/** Shared vocabulary for the six attributes and the rank ladder. */

export const STATS = [
  { key: 'STR', name: 'Strength',     icon: 'Dumbbell',   color: '#FF6B6B',
    blurb: 'Load moved. Progressive overload against real resistance.' },
  { key: 'VIT', name: 'Vitality',     icon: 'HeartPulse', color: '#34D399',
    blurb: 'Recovery, nourishment, sleep, body composition.' },
  { key: 'AGI', name: 'Agility',      icon: 'Wind',       color: '#3EC6FF',
    blurb: 'Conditioning. Cardio, sport, how often the body moves.' },
  { key: 'INT', name: 'Intelligence', icon: 'BrainCircuit', color: '#A78BFA',
    blurb: 'Deliberate practice and competence proven under examination.' },
  { key: 'PER', name: 'Perception',   icon: 'Coins',      color: '#F5C542',
    blurb: 'Financial control. Planned spending, budgets, savings rate.' },
  { key: 'WIL', name: 'Will',         icon: 'Flame',      color: '#FB923C',
    blurb: 'Discipline. Streaks held, deadlines met, promises kept.' },
]

export const STAT_MAP = Object.fromEntries(STATS.map((s) => [s.key, s]))
export const STAT_KEYS = STATS.map((s) => s.key)

export const RANKS = [
  { key: 'E',        min: 1,   label: 'E-Rank', title: 'The Weakest',        color: '#9AA7BC' },
  { key: 'D',        min: 10,  label: 'D-Rank', title: 'Awakened',           color: '#8FD49B' },
  { key: 'C',        min: 25,  label: 'C-Rank', title: 'Proven',             color: '#63D3FF' },
  { key: 'B',        min: 45,  label: 'B-Rank', title: 'Elite',              color: '#94AAFF' },
  { key: 'A',        min: 65,  label: 'A-Rank', title: 'Formidable',         color: '#CBAAFF' },
  { key: 'S',        min: 85,  label: 'S-Rank', title: 'Monarch',            color: '#FFDE7A' },
  { key: 'NATIONAL', min: 100, label: 'National Level', title: 'Sovereign',  color: '#FFB3C1' },
]

export const RANK_MAP = Object.fromEntries(RANKS.map((r) => [r.key, r]))

export const rankForLevel = (lvl) =>
  [...RANKS].reverse().find((r) => lvl >= r.min) || RANKS[0]

export const nextRank = (lvl) => RANKS.find((r) => r.min > lvl) || null

/** Mirrors public.xp_for_level in Postgres. Kept in sync deliberately —
 *  the client only ever *previews* progress; the server is the authority. */
export const xpForLevel = (lvl) => Math.max(40, Math.floor(40 * Math.pow(Math.max(lvl, 1), 1.25)))

export const MEAL_SLOTS = [
  { key: 'BREAKFAST', label: 'Breakfast' },
  { key: 'LUNCH',     label: 'Lunch' },
  { key: 'DINNER',    label: 'Dinner' },
  { key: 'SNACK',     label: 'Snack' },
]

export const EXPENSE_CATEGORIES = [
  'Rent', 'Groceries', 'Food Delivery', 'Eating Out', 'Transport', 'Fuel',
  'Utilities', 'Phone & Internet', 'Health', 'Fitness', 'Education',
  'Subscriptions', 'Shopping', 'Entertainment', 'Travel', 'Gifts',
  'Family', 'Insurance', 'EMI', 'Investments', 'Other',
]

export const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Business', 'Dividends', 'Interest', 'Rental', 'Other']

export const ASSET_CLASSES = ['EQUITY', 'MF', 'ETF', 'GOLD', 'CRYPTO', 'BOND', 'CASH']
