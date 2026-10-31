import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useMe } from '@/features/auth/hooks'

interface ProtectedRouteProps {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { data: user, isLoading, isError } = useMe()

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#64748b' }}>
        Loading session...
      </div>
    )
  }

  if (isError || !user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
