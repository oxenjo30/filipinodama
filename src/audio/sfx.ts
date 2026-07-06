// Tiny WebAudio synth for game feedback — no audio files needed.
import { useSettingsStore } from '../store/settingsStore'

let ctx: AudioContext | null = null

function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(
  freqFrom: number,
  freqTo: number,
  duration: number,
  type: OscillatorType = 'triangle',
  peak = 0.12,
  delay = 0,
) {
  if (!useSettingsStore.getState().sound) return
  const ac = audioCtx()
  if (!ac) return
  const t0 = ac.currentTime + delay
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freqFrom, t0)
  osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), t0 + duration)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.05)
}

export const sfx = {
  select: () => tone(520, 660, 0.07, 'triangle', 0.06),
  move: () => tone(320, 240, 0.09, 'triangle', 0.1),
  capture: () => tone(180, 70, 0.18, 'square', 0.12),
  promote: () => {
    tone(440, 440, 0.12, 'triangle', 0.09)
    tone(554, 554, 0.12, 'triangle', 0.09, 0.09)
    tone(659, 659, 0.2, 'triangle', 0.1, 0.18)
  },
  win: () => {
    tone(392, 392, 0.16, 'triangle', 0.1)
    tone(494, 494, 0.16, 'triangle', 0.1, 0.14)
    tone(587, 587, 0.34, 'triangle', 0.12, 0.28)
  },
  lose: () => {
    tone(294, 294, 0.2, 'triangle', 0.09)
    tone(233, 233, 0.34, 'triangle', 0.1, 0.18)
  },
}
