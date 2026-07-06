import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ASSETS, PRELOAD_ASSETS } from '../assets/assetManifest'

const MIN_SPLASH_MS = 1100

function preload(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => resolve() // missing art never blocks entry
    img.src = src
  })
}

export function SplashPage() {
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState(0)

  useEffect(() => {
    let cancelled = false
    const t0 = performance.now()
    const run = async () => {
      let done = 0
      await Promise.all(
        PRELOAD_ASSETS.map((a) =>
          preload(a.src).then(() => {
            done++
            if (!cancelled) setLoaded(done)
          }),
        ),
      )
      const wait = Math.max(0, MIN_SPLASH_MS - (performance.now() - t0))
      window.setTimeout(() => {
        if (cancelled) return
        const visited = localStorage.getItem('filipinodama-visited') === '1'
        navigate(visited ? '/home' : '/landing', { replace: true })
      }, wait)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const progress = Math.round((loaded / PRELOAD_ASSETS.length) * 100)

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="anim-splash-rise flex flex-col items-center">
        <img src={ASSETS.logo.src} alt="FilipinoDama sun emblem" className="size-24 drop-shadow-[0_0_24px_rgba(212,169,78,0.45)]" />
        <h1 className="heading-caps mt-6 text-3xl text-parchment sm:text-4xl">
          Filipino<span className="text-gold-300">Dama</span>
        </h1>
        <p className="mt-2 text-sm text-mist">Filipino Dama, reimagined.</p>
      </div>

      <div className="mt-12 w-48" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Loading assets">
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300 transition-all duration-300"
            style={{ width: `${Math.max(8, progress)}%` }}
          />
        </div>
        <p className="tabular mt-2 text-center text-xs text-mist">Preparing the board…</p>
      </div>
    </div>
  )
}
