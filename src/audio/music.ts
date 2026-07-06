// Background music: "Balangay of Iron" (existing project track), lazy-loaded
// and only ever started from a user gesture to satisfy autoplay policies.
import { AUDIO } from '../assets/assetManifest'
import { useSettingsStore } from '../store/settingsStore'

let el: HTMLAudioElement | null = null

function ensureElement(): HTMLAudioElement {
  if (!el) {
    el = new Audio(AUDIO.music)
    el.loop = true
    el.volume = 0.3
    el.preload = 'none'
  }
  return el
}

export function syncMusic(): void {
  const enabled = useSettingsStore.getState().music
  const audio = ensureElement()
  if (enabled) {
    void audio.play().catch(() => {
      // Autoplay blocked — will retry on the next user gesture.
    })
  } else {
    audio.pause()
  }
}

/** Attach once at app start: resumes music on the first interaction if enabled. */
export function installMusicGestureHook(): void {
  const retry = () => {
    if (useSettingsStore.getState().music) syncMusic()
  }
  window.addEventListener('pointerdown', retry, { once: true })
}
