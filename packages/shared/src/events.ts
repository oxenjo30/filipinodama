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

  // rooms
  roomCreate: "room:create",
  roomJoin: "room:join",
  roomLeave: "room:leave",
  roomState: "room:state",
  roomInvite: "room:invite",
  roomSettings: "room:settings",
  roomKick: "room:kick",
  roomBan: "room:ban",
  roomSpectate: "room:spectate",
  roomStart: "room:start",

  // spectating
  spectateJoin: "spectate:join",
  spectateLeave: "spectate:leave",

  // chat
  chatSend: "chat:send",
  chatMessage: "chat:message",
  chatRead: "chat:read",
  chatUnread: "chat:unread",
  chatNotify: "chat:notify",

  // notifications
  notifNew: "notif:new",
} as const;

export type EventName = (typeof EV)[keyof typeof EV];
