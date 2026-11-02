import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/obligations', label: 'Obligations' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/imports', label: 'CSV Import' },
  { to: '/decision/new', label: 'New Decision' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/profile', label: 'Profile' },
  { to: '/settings', label: 'Settings' },
]


export function Sidebar() {
  return (
    <nav
      aria-label="Main navigation"
      style={{
        width: 220,
        background: 'var(--color-bg)',
        borderRight: '1px solid var(--color-border)',
        padding: 'var(--space-2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ padding: '12px 8px 24px', fontWeight: 700, color: 'var(--color-primary)', fontSize: 18 }}>
        BeforeBorrow
      </div>
      {navItems.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          style={({ isActive }) => ({
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
            background: isActive ? '#f0fdfa' : 'transparent',
            fontWeight: isActive ? 600 : 400,
            fontSize: 14,
          })}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
