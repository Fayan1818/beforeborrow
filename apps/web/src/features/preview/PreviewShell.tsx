import { useEffect, useState } from 'react'
import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { previewMockApi } from './previewMockApi'

export function PreviewIndexRedirect() {
  return <Navigate to="/__preview/profile" replace />
}

export function PreviewShell() {
  const queryClient = useQueryClient()
  const [emptyActive, setEmptyActive] = useState(previewMockApi.simulateEmpty)
  const [conflictActive, setConflictActive] = useState(previewMockApi.simulateConflict)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  // Prime queryClient with mock user and activate preview mock adapter
  useEffect(() => {
    previewMockApi.setActive(true)
    const mockUser = {
      id: 'dev-preview-user-b',
      email_normalized: 'preview.user@beforeborrow.dev',
      created_at: '2026-11-01T00:00:00Z',
      csrf_token: 'preview-demo-csrf-token',
    }
    sessionStorage.setItem('csrf_token', mockUser.csrf_token)
    queryClient.setQueryData(queryKeys.me(), mockUser)

    return () => {
      previewMockApi.setActive(false)
    }
  }, [queryClient])

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg)
    setTimeout(() => setFeedbackMessage(null), 3000)
  }

  const handleResetData = () => {
    previewMockApi.resetToDefaults()
    setEmptyActive(false)
    setConflictActive(false)
    queryClient.invalidateQueries()
    showFeedback('✓ In-memory demo data reset to default Indian financial profile')
  }

  const handleToggleEmpty = () => {
    const isNowEmpty = previewMockApi.toggleEmptyState()
    setEmptyActive(isNowEmpty)
    queryClient.invalidateQueries()
    showFeedback(
      isNowEmpty
        ? '✓ Empty state active (inspect onboarding / zero-data UI)'
        : '✓ Populated demo data restored'
    )
  }

  const handleToggleConflict = () => {
    const isNowConflict = previewMockApi.toggleConflictSimulation()
    setConflictActive(isNowConflict)
    showFeedback(
      isNowConflict
        ? '⚠️ 409 Conflict Simulation armed for next mutation (tests optimistic concurrency banner)'
        : '✓ Conflict simulation disabled'
    )
  }

  const navLinks = [
    { to: '/__preview/profile', label: 'Financial Profile & Cashflow', icon: '👤' },
    { to: '/__preview/obligations', label: 'Obligations & Debt Tracker', icon: '💳' },
    { to: '/__preview/calendar', label: 'Cashflow Calendar', icon: '📅' },
    { to: '/__preview/imports', label: 'CSV Import Pipeline', icon: '📥' },
    { to: '/__preview/snapshot', label: 'Financial Snapshot & Quality', icon: '📊' },
  ]

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      {/* 1. Development Preview Top Banner */}
      <header
        style={{
          background: 'linear-gradient(90deg, #1e293b 0%, #0f172a 100%)',
          color: '#ffffff',
          padding: '12px 24px',
          borderBottom: '2px solid #0d9488',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div
          style={{
            maxWidth: 1400,
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 9999,
                background: '#0d9488',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              ⚡ DEV PREVIEW
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                BeforeBorrow — Person B Visual Inspection Mode
                <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>
                  (Demo Data • No PostgreSQL / Auth Server Required)
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                All changes update an interactive in-memory store without persisting to PostgreSQL.
              </div>
            </div>
          </div>

          {/* Interactive Preview Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={handleResetData}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #475569',
                background: '#334155',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Reset all profile, rules, and obligations to original demo state"
            >
              🔄 Reset Demo Data
            </button>

            <button
              onClick={handleToggleEmpty}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: emptyActive ? '1px solid #f59e0b' : '1px solid #475569',
                background: emptyActive ? '#78350f' : '#334155',
                color: emptyActive ? '#fef3c7' : '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Test how screens look when no profile or obligations exist"
            >
              {emptyActive ? '✓ Empty State Active' : 'Toggle Empty State'}
            </button>

            <button
              onClick={handleToggleConflict}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: conflictActive ? '1px solid #ef4444' : '1px solid #475569',
                background: conflictActive ? '#7f1d1d' : '#334155',
                color: conflictActive ? '#fee2e2' : '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Simulate 409 Conflict on next mutation to test version mismatch banners"
            >
              {conflictActive ? '⚠️ 409 Armed' : 'Simulate 409 Conflict'}
            </button>

            <div
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                background: '#0f172a',
                border: '1px solid #334155',
                fontSize: 11,
                color: '#94a3b8',
                display: 'flex',
                gap: 8,
              }}
            >
              <span>Profile v{previewMockApi.profile?.data_version ?? 0}</span>
              <span>•</span>
              <span>{previewMockApi.obligations.length} Obligations</span>
              <span>•</span>
              <span>{previewMockApi.cashflowRules.length} Rules</span>
            </div>
          </div>
        </div>

        {feedbackMessage && (
          <div
            style={{
              maxWidth: 1400,
              margin: '8px auto 0',
              padding: '6px 12px',
              borderRadius: 6,
              background: '#0f766e',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {feedbackMessage}
          </div>
        )}
      </header>

      {/* 2. Main Preview Body with Sidebar and Outlet */}
      <div style={{ flex: 1, display: 'flex', maxWidth: 1400, width: '100%', margin: '0 auto' }}>
        {/* Navigation Sidebar */}
        <nav
          aria-label="Preview navigation"
          style={{
            width: 260,
            background: '#ffffff',
            borderRight: '1px solid #e2e8f0',
            padding: '24px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: '#64748b',
              letterSpacing: '0.05em',
              marginBottom: 8,
              paddingLeft: 8,
            }}
          >
            Person B Feature Screens
          </div>

          {navLinks.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 8,
                color: isActive ? '#0d9488' : '#334155',
                background: isActive ? '#f0fdfa' : 'transparent',
                border: isActive ? '1px solid #ccfbf1' : '1px solid transparent',
                fontWeight: isActive ? 600 : 500,
                fontSize: 14,
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              })}
            >
              <span style={{ fontSize: 16 }}>{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}

          <div
            style={{
              marginTop: 'auto',
              paddingTop: 16,
              borderTop: '1px solid #e2e8f0',
            }}
          >
            <div style={{ fontSize: 11, color: '#94a3b8', padding: '0 8px 8px' }}>
              Logged in as:
              <br />
              <strong style={{ color: '#475569' }}>preview.user@beforeborrow.dev</strong>
            </div>
            <a
              href="/"
              style={{
                display: 'block',
                padding: '8px 12px',
                borderRadius: 6,
                color: '#64748b',
                fontSize: 12,
                textDecoration: 'none',
                border: '1px solid #e2e8f0',
                textAlign: 'center',
                background: '#f8fafc',
              }}
            >
              Exit Preview to Landing Page
            </a>
          </div>
        </nav>

        {/* Main Content Area */}
        <main
          id="preview-main-content"
          style={{
            flex: 1,
            padding: '24px 32px',
            minWidth: 0,
            overflowY: 'auto',
          }}
        >
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
