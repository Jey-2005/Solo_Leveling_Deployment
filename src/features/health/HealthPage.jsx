import { useState } from 'react'
import { Tabs } from '../../components/system'
import WorkoutLogger from './components/WorkoutLogger'
import Nutrition from './components/Nutrition'
import BodyReport from './components/BodyReport'
import Challenge from './components/Challenge'

const TABS = [
  { key: 'workouts',  label: 'Workouts' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'body',      label: 'Body' },
  { key: 'challenge', label: 'Challenge' },
]

export default function HealthPage() {
  const [tab, setTab] = useState('workouts')
  return (
    <div className="space-y-5">
      <div>
        <div className="sys-eyebrow mb-1.5">Health</div>
        <h1 className="font-display text-2xl text-bone leading-none">Body & Discipline</h1>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'workouts'  && <WorkoutLogger />}
      {tab === 'nutrition' && <Nutrition />}
      {tab === 'body'      && <BodyReport />}
      {tab === 'challenge' && <Challenge />}
    </div>
  )
}
