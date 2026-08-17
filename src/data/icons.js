/**
 * Icon registry.
 *
 * The DB stores icon names as strings, so something has to map string -> component.
 * `import * as Icons from 'lucide-react'` does that in one line but defeats
 * tree-shaking and drags roughly 700 kB of unused SVG into the bundle. Naming
 * the icons explicitly keeps only what is actually rendered.
 */
import {
  Dumbbell, Footprints, Bike, Waves, Zap, Activity, Flower, User, Flame,
  Trophy, Rows3, CircleDot, Swords, Shield, Mountain, Music, TrendingUp,
  Orbit, MountainSnow, Circle, Dribbble, StretchHorizontal, Snowflake,
  HeartPulse, Wind, BrainCircuit, Coins,
} from 'lucide-react'

/** Icon names as they appear in workout_types.icon. */
const REGISTRY = {
  dumbbell: Dumbbell,
  footprints: Footprints,
  bike: Bike,
  waves: Waves,
  zap: Zap,
  activity: Activity,
  flower: Flower,
  user: User,
  flame: Flame,
  trophy: Trophy,
  rows: Rows3,
  'rows3': Rows3,
  'circle-dot': CircleDot,
  swords: Swords,
  shield: Shield,
  mountain: Mountain,
  music: Music,
  'trending-up': TrendingUp,
  orbit: Orbit,
  'mountain-snow': MountainSnow,
  circle: Circle,
  dribbble: Dribbble,
  'stretch-horizontal': StretchHorizontal,
  snowflake: Snowflake,

  // attribute icons (data/system.js)
  Dumbbell, HeartPulse, Wind, BrainCircuit, Coins, Flame,
}

/** Always returns a component — an unknown name falls back rather than crashing. */
export const iconFor = (name) => REGISTRY[name] || REGISTRY[String(name).toLowerCase()] || Circle

export default REGISTRY
