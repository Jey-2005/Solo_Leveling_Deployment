import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, SystemProvider, useSystem } from './context/SystemContext'
import { RequireAuth, RequireOnboarded } from './components/layout/ProtectedRoute'
import Layout from './components/layout/Layout'
import { Loading } from './components/system'
import AuthPage from './features/auth/AuthPage'
import Awakening from './features/onboarding/Awakening'
import Dashboard from './features/dashboard/Dashboard'

/* The heavy screens are split out — the dashboard is what has to be fast. */
const HealthPage   = lazy(() => import('./features/health/HealthPage'))
const FinancePage  = lazy(() => import('./features/finance/FinancePage'))
const TasksPage    = lazy(() => import('./features/tasks/TasksPage'))
const SkillsPage   = lazy(() => import('./features/skills/SkillsPage'))
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'))

const Fallback = () => <Loading label="Opening" />

/** Applies the hunter's reduce-motion preference to the document. */
function MotionSync() {
  const { settings } = useSystem()
  useEffect(() => {
    if (settings) document.documentElement.dataset.reduceMotion = String(!!settings.reduce_motion)
  }, [settings])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SystemProvider>
          <MotionSync />
          <Suspense fallback={<Fallback />}>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />

              <Route path="/awaken" element={
                <RequireAuth><Awakening /></RequireAuth>
              } />

              <Route element={
                <RequireAuth><RequireOnboarded><Layout /></RequireOnboarded></RequireAuth>
              }>
                <Route index element={<Dashboard />} />
                <Route path="health" element={<HealthPage />} />
                <Route path="finance" element={<FinancePage />} />
                <Route path="tasks" element={<TasksPage />} />
                <Route path="skills" element={<SkillsPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </SystemProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
