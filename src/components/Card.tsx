import type { HTMLAttributes } from 'react'

/** Translucent dark panel with a faint gold border — the app's base surface. */
export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`glass rounded-2xl ${className}`} {...rest}>
      {children}
    </div>
  )
}
