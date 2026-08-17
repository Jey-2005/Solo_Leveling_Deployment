import { Navigate, useLocation } from 'react-router-dom'
import { useAuth, useSystem } from '../../context/SystemContext'
import { Loading } from '../system'

export function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="min-h-dvh grid place-items-center"><Loading label="Verifying" /></div>
  if (!user) return <Navigate to="/auth" state={{ from: loc }} replace />
  return children
}

/** Blocks the app until the hunter has actually been awakened. */
export function RequireOnboarded({ children }) {
  const { hunter, loading } = useSystem()
  const loc = useLocation()
  if (loading) return <div className="min-h-dvh grid place-items-center"><Loading label="Reading status" /></div>
  if (hunter && !hunter.onboarded && loc.pathname !== '/awaken') {
    return <Navigate to="/awaken" replace />
  }
  return children
}
