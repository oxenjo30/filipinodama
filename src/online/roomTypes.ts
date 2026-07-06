// Contracts for the future online backend (Firebase RTDB — project dama-90740).
// The UI is built against these types so wiring the real service later is a
// drop-in replacement of roomService.ts.
import type { MoveSequence, Side } from '../game'

export type TimerOption = 'none' | '3min' | '5min' | '10min'
export type RoomVisibility = 'private' | 'public'
export type MatchType = 'casual' | 'ranked'

export interface RoomConfig {
  hostName: string
  matchType: MatchType
  timer: TimerOption
  visibility: RoomVisibility
}

export interface Room {
  code: string
  config: RoomConfig
  createdAt: number
  status: 'waiting' | 'playing' | 'finished'
  players: Partial<Record<Side, { name: string; connected: boolean }>>
}

export interface RoomService {
  /** true when a real backend is wired up; the UI must not pretend otherwise */
  readonly online: boolean
  createRoom(config: RoomConfig): Promise<Room>
  joinRoom(code: string, playerName: string): Promise<Room>
  sendMove(code: string, seq: MoveSequence): Promise<void>
  leaveRoom(code: string): Promise<void>
}
