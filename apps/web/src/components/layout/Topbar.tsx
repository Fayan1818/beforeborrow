export function Topbar() {
  return (
    <header
      style={{
        height: 56,
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-3)',
        gap: 'var(--space-2)',
      }}
    >
      <h1 id="page-title" style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>
        BeforeBorrow
      </h1>
      <button
        aria-label="User menu"
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'var(--color-primary)',
          color: '#fff',
          border: 'none',
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        U
      </button>
    </header>
  )
}
