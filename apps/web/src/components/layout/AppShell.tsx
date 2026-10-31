import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Topbar />
        <main
          id="main-content"
          style={{ flex: 1, padding: 'var(--space-3)', maxWidth: 1200, width: '100%', margin: '0 auto' }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
