// LOCAL-ONLY room service. There is intentionally no fake networking here:
// `online` is false, joinRoom always rejects, and the UI says so plainly.
//
// TODO(online-backend): replace with a Firebase RTDB implementation.
// The previous project's Firebase config (project dama-90740, RTDB in
// asia-southeast1) and Cloud Functions (presence, ELO, stats) are reusable —
// see docs/ONLINE_TODO.md for the full wiring plan.
import type { Room, RoomConfig, RoomService } from './roomTypes'

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O/1/I/L

export function generateRoomCode(): string {
  let code = ''
  const bytes = new Uint32Array(6)
  crypto.getRandomValues(bytes)
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return code
}

export const roomService: RoomService = {
  online: false,

  createRoom(config: RoomConfig): Promise<Room> {
    // Local preview only — the room exists on this device and nowhere else.
    return Promise.resolve({
      code: generateRoomCode(),
      config,
      createdAt: Date.now(),
      status: 'waiting',
      players: { red: { name: config.hostName, connected: true } },
    })
  },

  joinRoom(): Promise<Room> {
    return Promise.reject(new Error('Online rooms are not connected yet.'))
  },

  sendMove(): Promise<void> {
    return Promise.reject(new Error('Online rooms are not connected yet.'))
  },

  leaveRoom(): Promise<void> {
    return Promise.resolve()
  },
}
