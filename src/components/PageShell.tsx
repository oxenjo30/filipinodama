import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ASSETS } from '../assets/assetManifest'
import { IconBack } from './icons'

interface PageShellProps {
  title?: string
  backTo?: string
  children: ReactNode
  /** wider layout for content-heavy pages */
  wide?: boolean
  actions?: ReactNode
}

/** Shared page chrome: sticky header with back nav + logo, centered content column. */
export function PageShell({ title, backTo, children, wide = false, actions }: PageShellProps) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-night-950/80 backdrop-blur-md">
        <div
          className={`mx-auto flex h-14 items-center gap-2 px-4 ${wide ? 'max-w-5xl' : 'max-w-2xl'}`}
        >
          {backTo ? (
            <Link
              to={backTo}
              aria-label="Go back"
              className="-ml-2 flex size-11 items-center justify-center rounded-xl text-mist transition-colors hover:bg-white/5 hover:text-parchment"
            >
              <IconBack />
            </Link>
          ) : (
            <img src={ASSETS.logo.src} alt="" className="size-8" />
          )}
          {title && (
            <h1 className="heading-caps truncate text-base text-parchment sm:text-lg">{title}</h1>
          )}
          <div className="ml-auto flex items-center gap-1">{actions}</div>
        </div>
      </header>
      <main className={`mx-auto px-4 pt-6 pb-24 ${wide ? 'max-w-5xl' : 'max-w-2xl'}`}>
        {children}
      </main>
    </div>
  )
}
