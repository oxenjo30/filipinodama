import { useEffect, useRef, type ReactNode } from 'react'
import { IconClose } from './icons'

interface ModalProps {
  open: boolean
  onClose?: () => void
  title?: ReactNode
  children: ReactNode
  /** hide the X button (e.g. result modal steers users to explicit actions) */
  dismissable?: boolean
  maxWidth?: string
}

export function Modal({
  open,
  onClose,
  title,
  children,
  dismissable = true,
  maxWidth = 'max-w-md',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onClose?.()
    }
    window.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismissable, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 anim-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-night-950/75 backdrop-blur-sm"
        onClick={dismissable ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative w-full ${maxWidth} glass rounded-2xl bg-night-900/95 p-6 shadow-2xl anim-modal-in outline-none max-h-[85dvh] overflow-y-auto`}
      >
        {(title || dismissable) && (
          <div className="mb-4 flex items-start justify-between gap-4">
            {title ? (
              <h2 className="heading-caps text-lg text-gold-300">{title}</h2>
            ) : (
              <span />
            )}
            {dismissable && (
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="-m-2 flex size-11 items-center justify-center rounded-xl text-mist hover:bg-white/5 hover:text-parchment"
              >
                <IconClose />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
