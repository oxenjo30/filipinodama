import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'danger' | 'ghost' | 'outline'
type Size = 'md' | 'lg' | 'sm'

interface GameButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 ' +
  'active:scale-[0.97] disabled:opacity-45 disabled:active:scale-100 select-none'

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-gold-300 to-gold-500 text-night-950 shadow-glow-gold ' +
    'hover:from-gold-200 hover:to-gold-400',
  danger:
    'bg-gradient-to-b from-ember-500 to-ember-700 text-parchment ' +
    'hover:from-ember-400 hover:to-ember-600 border border-ember-400/40',
  ghost: 'bg-white/5 text-parchment hover:bg-white/10 border border-white/10',
  outline: 'bg-transparent text-gold-300 border border-gold-500/50 hover:bg-gold-500/10',
}

const sizes: Record<Size, string> = {
  sm: 'text-sm px-3.5 py-2 min-h-10',
  md: 'text-[15px] px-5 py-2.5 min-h-11',
  lg: 'text-base px-7 py-3.5 min-h-12',
}

export function GameButton({
  variant = 'ghost',
  size = 'md',
  icon,
  className = '',
  children,
  type = 'button',
  ...rest
}: GameButtonProps) {
  return (
    <button type={type} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  )
}
