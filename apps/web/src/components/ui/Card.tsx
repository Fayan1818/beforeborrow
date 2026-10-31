import { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'sm' | 'md' | 'lg'
}

const paddingMap = { sm: '12px', md: '20px', lg: '32px' }

export function Card({ padding = 'md', children, style, ...rest }: CardProps) {
  return (
    <div
      style={{
        background: 'var(--color-bg)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--color-border)',
        padding: paddingMap[padding],
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
