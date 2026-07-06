import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Side } from '../game'

export type BoardTheme = 'obsidian' | 'classic'
export type PieceStyle = 'portrait' | 'minimal'
export type AnimationSpeed = 'off' | 'normal' | 'fast'
export type Language = 'en' | 'fil'

export interface ProfileStats {
  matchesPlayed: number
  wins: number
  losses: number
  draws: number
}

export type AvatarChoice =
  | 'default'
  | 'male'
  | 'female'
  | 'mandirigma'
  | 'babaylan'
  | 'bagani'
  | 'diwata'
  | 'sultan'
  | 'ermitanyo'

interface SettingsState {
  playerName: string
  avatar: AvatarChoice
  favoriteFaction: Side
  sound: boolean
  music: boolean
  boardTheme: BoardTheme
  pieceStyle: PieceStyle
  moveHints: boolean
  animationSpeed: AnimationSpeed
  language: Language
  stats: ProfileStats
  update: (partial: Partial<Omit<SettingsState, 'update' | 'recordResult' | 'stats'>>) => void
  recordResult: (result: 'win' | 'loss' | 'draw' | 'played') => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      playerName: '',
      avatar: 'default',
      favoriteFaction: 'red',
      sound: true,
      music: false,
      boardTheme: 'obsidian',
      pieceStyle: 'portrait',
      moveHints: true,
      animationSpeed: 'normal',
      language: 'en',
      stats: { matchesPlayed: 0, wins: 0, losses: 0, draws: 0 },
      update: (partial) => set(partial),
      recordResult: (result) =>
        set((s) => ({
          stats: {
            matchesPlayed: s.stats.matchesPlayed + 1,
            wins: s.stats.wins + (result === 'win' ? 1 : 0),
            losses: s.stats.losses + (result === 'loss' ? 1 : 0),
            draws: s.stats.draws + (result === 'draw' ? 1 : 0),
          },
        })),
    }),
    { name: 'filipinodama-settings' },
  ),
)

/** Milliseconds for piece glide, derived from the animation-speed setting. */
export function animationMs(speed: AnimationSpeed): number {
  return speed === 'off' ? 0 : speed === 'fast' ? 120 : 260
}
