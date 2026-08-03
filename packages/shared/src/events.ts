/** Canonical Socket.IO event names shared by client + server. */
export const EV = {
  // presence
  presencePing: "presence:ping",
  presenceUpdate: "presence:update",

  // matchmaking
  mmJoin: "mm:join",
  mmLeave: "mm:leave",
  mmSearching: "mm:searching",
  mmFound: "mm:found",
  mmAccept: "mm:accept",
  mmCancelled: "mm:cancelled",

  // match play
  matchState: "match:state",
  matchMove: "match:move",
  matchMoved: "match:moved",
  matchIllegal: "match:illegal",
  matchClock: "match:clock",
  matchResign: "match:resign",
  matchDrawOffer: "match:draw:offer",
  matchDrawAccept: "match:draw:accept",
  matchDrawDecline: "match:draw:decline",
  matchEnded: "match:ended",
  matchResync: "match:resync",
  matchRematchOffer: "match:rematch:offer",
  matchRematchAccept: "match:rematch:accept",
  matchRematchDecline: "match:rematch:decline",
  matchRematchReady: "match:rematch:ready", // server → both: new match seeded
  matchChat: "match:chat", // in-match quick chat / emote (server relays to the room)

  // rooms
  roomCreate: "room:create",
  roomJoin: "room:join",
  roomLeave: "room:leave",
  roomState: "room:state",
  roomInvite: "room:invite",
  roomSettings: "room:settings",
  roomKick: "room:kick",
  roomBan: "room:ban",
  roomLock: "room:lock",
  roomSpectate: "room:spectate",
  roomStart: "room:start",

  // ── Tournament ready-check (V1.5) — a bracket slot is played as a real Match
  //    that the SERVER creates once BOTH competitors have readied up. Mirrors the
  //    room:start handoff (server → presence:<userId>), but with "both ready"
  //    replacing "the host clicked start". See realtime/tournament-live.ts. ──
  /** client → server: "I'm ready to play my bracket slot" (payload {tmId}).
   *  Ready is a COMMITMENT — there is no un-ready (it would let a player stall
   *  the bracket); the first ready arms the opponent's no-show deadline. */
  tournamentReady: "tournament:ready",
  /** server → both competitors (presence:<userId>): readiness/deadline changed.
   *  Payload is the same `myMatch` shape GET /api/tournaments/:id returns, so a
   *  client renders one code path whether it polled or was pushed. */
  tournamentMatchState: "tournament:matchState",
  /** server → each competitor: the match is live, go play it
   *  (payload {tournamentId, tmId, matchId, yourColor}). */
  tournamentStart: "tournament:start",

  // spectating
  spectateJoin: "spectate:join",
  spectateLeave: "spectate:leave",
  /** server → match room: real spectator count changed (payload {matchId, viewers}) */
  spectateCount: "spectate:count",

  // chat
  chatSend: "chat:send",
  chatMessage: "chat:message",
  chatRead: "chat:read",
  chatUnread: "chat:unread",
  chatNotify: "chat:notify",
  // guild chat (server broadcasts to a `guild:<guildId>` room; clients join on
  // opening their guild's chat and get live messages from guildmates)
  guildChatJoin: "guild:chat:join",
  guildChatLeave: "guild:chat:leave",
  guildChatMessage: "guild:chat:message",

  // notifications
  notifNew: "notif:new",

  // ── Math Dama (Damath) — parallel to the Classic match/mm events, additive.
  //    Server-authoritative + unranked (no economy). See damath-match.ts. ──
  damathMmJoin: "damath:mm:join",
  damathMmLeave: "damath:mm:leave",
  damathMmSearching: "damath:mm:searching",
  damathMmFound: "damath:mm:found",
  damathMmCancelled: "damath:mm:cancelled",
  damathState: "damath:state",
  damathMove: "damath:move",
  damathMoved: "damath:moved",
  damathIllegal: "damath:illegal",
  damathResign: "damath:resign",
  damathEnded: "damath:ended",
  damathResync: "damath:resync",

  // Math Dama private rooms — invite a friend by code, play on two devices.
  // Reuses Classic's room PATTERNS but seeds a Damath match (damath-match.ts).
  damathRoomCreate: "damath:room:create",
  damathRoomJoin: "damath:room:join",
  damathRoomLeave: "damath:room:leave",
  damathRoomState: "damath:room:state",
  damathRoomStart: "damath:room:start", // host starts → server seeds the match
  damathRoomChat: "damath:room:chat", // lobby chat, relayed to the room
  damathRoomSpectate: "damath:room:spectate", // join a room to watch (read-only)
} as const;

export type EventName = (typeof EV)[keyof typeof EV];
