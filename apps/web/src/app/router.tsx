/**
 * Application router.
 * Owner: A — owns route registration.
 *
 * Public routes: /, /login, /signup, /demo
 * Protected routes: /dashboard, /profile, /obligations, /calendar,
 *   /decision/new, /decision/:id, /reports/:id, /alerts, /settings
 */
import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import LoginPage from '@/features/auth/pages/LoginPage'
import SignupPage from '@/features/auth/pages/SignupPage'
import DashboardPage from '@/features/dashboard/pages/DashboardPage'
import ProfilePage from '@/features/profile/pages/ProfilePage'
import ObligationsPage from '@/features/obligations/pages/ObligationsPage'
import CalendarPage from '@/features/calendar/pages/CalendarPage'
import ImportsPage from '@/features/imports/pages/ImportsPage'
import DecisionPage from '@/features/decision/pages/DecisionPage'
import ReportsPage from '@/features/reports/pages/ReportsPage'
import AlertsPage from '@/features/alerts/pages/AlertsPage'

import { PreviewShell, PreviewIndexRedirect } from '@/features/preview/PreviewShell'
import { PreviewSnapshotView } from '@/features/preview/PreviewSnapshotView'

// Simple placeholders for Landing, Demo, Settings
const LandingPage = () => (
  <div style={{ padding: 32, textAlign: 'center' }}>
    <h1>BeforeBorrow</h1>
    <p>A credit limit tells you what is available. We show what each choice does to your cash, commitments and goals — on actual dates.</p>
  </div>
)
const DemoPage = () => <div style={{ padding: 32 }}>Demo Walkthrough</div>
const SettingsPage = () => <div style={{ padding: 32 }}>User Settings</div>

const devPreviewRoutes = import.meta.env.DEV
  ? [
      {
        path: '/__preview',
        element: <PreviewShell />,
        children: [
          { index: true, element: <PreviewIndexRedirect /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'obligations', element: <ObligationsPage /> },
          { path: 'calendar', element: <CalendarPage /> },
          { path: 'imports', element: <ImportsPage /> },
          { path: 'snapshot', element: <PreviewSnapshotView /> },
        ],
      },
    ]
  : []

export const router = createBrowserRouter([
  ...devPreviewRoutes,
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/demo', element: <DemoPage /> },
  {
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/obligations', element: <ObligationsPage /> },
      { path: '/calendar', element: <CalendarPage /> },
      { path: '/imports', element: <ImportsPage /> },
      { path: '/decision/new', element: <DecisionPage /> },
      { path: '/decision/:id', element: <DecisionPage /> },
      { path: '/reports/:id', element: <ReportsPage /> },
      { path: '/alerts', element: <AlertsPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
])
