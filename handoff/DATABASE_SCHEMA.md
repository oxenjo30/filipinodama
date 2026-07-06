# DATABASE_SCHEMA.md — Postgres (Prisma) + Redis

## Design principles

- **Currency lives in a ledger, not just a balance column.** Every grant/spend writes an append-only `LedgerEntry` inside a transaction; the balance columns on `User` are a denormalized cache kept in sync in the same transaction. This makes economy auditable and abuse-resistant.
- **Matches store the full move list** (`moves` JSON) so replays reconstruct deterministically via the engine.
- **Soft-delete users** (`deletedAt`) for the Delete-Account flow + GDPR export.
- Diamonds only ever increase via a `LedgerEntry` whose `reason = 'purchase'` linked to a settled `Payment`.

## `apps/server/prisma/schema.prisma`

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

// ---------- Identity ----------
model User {
  id            String   @id @default(cuid())
  email         String?  @unique
  emailVerified DateTime?
  passwordHash  String?
  isGuest       Boolean  @default(false)
  username      String   @unique
  displayName   String
  tag           String   @unique            // e.g. #4821 discriminator
  bio           String?  @db.Text
  avatarUrl     String?
  frameId       String?                      // equipped frame cosmetic
  countryCode   String?
  // economy caches (authoritative source = LedgerEntry aggregates)
  trophies      Int      @default(1000)      // ranked rating
  gold          Int      @default(0)
  diamonds      Int      @default(0)
  rankTier      String   @default("wood")    // derived; see DESIGN_SYSTEM rank tiers
  // equipped cosmetics
  equippedBoard String?
  equippedSkin  String?
  // stats
  wins   Int @default(0)
  losses Int @default(0)
  draws  Int @default(0)
  streak Int @default(0)
  createdAt DateTime @default(now())
  lastSeenAt DateTime @default(now())
  deletedAt  DateTime?

  oauthAccounts OAuthAccount[]
  sessions      Session[]
  ledger        LedgerEntry[]
  inventory     InventoryItem[]
  orders        Order[]
  payments      Payment[]
  matchesRed    Match[]  @relation("red")
  matchesBlue   Match[]  @relation("blue")
  sentReqs      FriendRequest[] @relation("from")
  recvReqs      FriendRequest[] @relation("to")
  friendshipsA  Friendship[]    @relation("a")
  friendshipsB  Friendship[]    @relation("b")
  guildMember   GuildMember?
  messagesSent  Message[]
  notifications Notification[]
  questProgress QuestProgress[]
  seasonProgress SeasonProgress[]
  @@index([trophies])
}

model OAuthAccount {
  id         String @id @default(cuid())
  provider   String                 // google | facebook
  providerId String
  userId     String
  user       User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerId])
}

model Session {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  refreshToken String   @unique
  userAgent    String?
  expiresAt    DateTime
  createdAt    DateTime @default(now())
}

// ---------- Economy ----------
enum Currency { GOLD DIAMONDS TROPHIES }

model LedgerEntry {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  currency  Currency
  amount    Int                          // signed: +grant / -spend
  balance   Int                          // resulting balance after this entry
  reason    String                       // win | daily | quest | purchase | contribution | season | admin | refund
  refType   String?                      // match | order | payment | quest | season
  refId     String?
  createdAt DateTime @default(now())
  @@index([userId, currency, createdAt])
}

// ---------- Store & inventory ----------
enum ItemType { BOARD SKIN AVATAR FRAME EMOTE BUNDLE SEASON_PASS }

model StoreItem {
  id          String   @id            // stable slug e.g. "board-marble", "skin-babaylan"
  type        ItemType
  name        String
  description String?  @db.Text
  priceGold   Int?
  priceDiamonds Int?
  assetKey    String                  // maps to public/assets path (see ASSETS.md)
  previewKey  String?
  bundleItems String[]                // StoreItem ids contained (for BUNDLE)
  isPremium   Boolean  @default(false)
  active      Boolean  @default(true)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  inventory   InventoryItem[]
}

model InventoryItem {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  itemId    String
  item      StoreItem @relation(fields: [itemId], references: [id])
  equipped  Boolean   @default(false)
  acquiredAt DateTime @default(now())
  @@unique([userId, itemId])
}

model Order {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  items      Json                       // [{itemId, name, currency, price}]
  currency   Currency
  total      Int
  status     String   @default("completed")   // completed | refunded
  createdAt  DateTime @default(now())
}

model Payment {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  provider      String   @default("stripe")
  providerRef   String   @unique       // stripe session / payment intent id
  amountCents   Int
  currencyCode  String   @default("usd")
  diamonds      Int                      // diamonds to credit on settle
  status        String   @default("pending")  // pending | settled | failed | refunded
  createdAt     DateTime @default(now())
  settledAt     DateTime?
}

// ---------- Matches & replays ----------
enum MatchMode { AI CASUAL RANKED PRIVATE LOCAL }
model Match {
  id         String    @id @default(cuid())
  mode       MatchMode
  redId      String?
  red        User?     @relation("red", fields: [redId], references: [id])
  blueId     String?
  blue       User?     @relation("blue", fields: [blueId], references: [id])
  settings   Json                       // forcedMaxCapture, drawMoveLimit, moveTimerSec
  moves      Json                       // full Move[] → deterministic replay
  winner     String?                    // red | blue | draw
  reason     String?
  redTrophyDelta  Int?
  blueTrophyDelta Int?
  goldReward Int?      @default(0)
  startedAt  DateTime  @default(now())
  endedAt    DateTime?
  @@index([redId]) @@index([blueId]) @@index([mode, endedAt])
}

// ---------- Social ----------
model FriendRequest {
  id      String @id @default(cuid())
  fromId  String
  from    User   @relation("from", fields: [fromId], references: [id], onDelete: Cascade)
  toId    String
  to      User   @relation("to", fields: [toId], references: [id], onDelete: Cascade)
  status  String @default("pending")   // pending | accepted | declined
  createdAt DateTime @default(now())
  @@unique([fromId, toId])
}

model Friendship {
  id     String @id @default(cuid())
  aId    String
  a      User   @relation("a", fields: [aId], references: [id], onDelete: Cascade)
  bId    String
  b      User   @relation("b", fields: [bId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  @@unique([aId, bId])
}

enum ChannelType { DM ROOM GUILD }
model Channel {
  id        String   @id @default(cuid())
  type      ChannelType
  refId     String?                      // guildId / roomId for group channels
  createdAt DateTime @default(now())
  members   ChannelMember[]
  messages  Message[]
}
model ChannelMember {
  id        String @id @default(cuid())
  channelId String
  channel   Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  userId    String
  lastReadAt DateTime @default(now())    // powers unread badges
  @@unique([channelId, userId])
}
model Message {
  id        String   @id @default(cuid())
  channelId String
  channel   Channel  @relation(fields: [channelId], references: [id], onDelete: Cascade)
  authorId  String
  author    User     @relation(fields: [authorId], references: [id])
  body      String   @db.Text
  createdAt DateTime @default(now())
  @@index([channelId, createdAt])
}

// ---------- Guilds ----------
model Guild {
  id          String   @id @default(cuid())
  name        String   @unique
  tag         String   @unique
  description String?  @db.Text
  crestKey    String?
  minTrophies Int      @default(0)       // join gate set by leader
  weeklyPoints Int     @default(0)
  createdAt   DateTime @default(now())
  members     GuildMember[]
  joinRequests GuildJoinRequest[]
}
enum GuildRole { LEADER OFFICER MEMBER }
model GuildMember {
  id        String    @id @default(cuid())
  guildId   String
  guild     Guild     @relation(fields: [guildId], references: [id], onDelete: Cascade)
  userId    String    @unique
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  role      GuildRole @default(MEMBER)
  weeklyContribution Int @default(0)
  joinedAt  DateTime  @default(now())
}
model GuildJoinRequest {
  id       String @id @default(cuid())
  guildId  String
  guild    Guild  @relation(fields: [guildId], references: [id], onDelete: Cascade)
  userId   String
  status   String @default("pending")   // pending | accepted | declined
  createdAt DateTime @default(now())
  @@unique([guildId, userId])
}

// ---------- Progression ----------
model Quest {
  id        String @id                  // slug
  scope     String                       // daily | seasonal
  title     String
  goal      Int
  rewardGold Int    @default(0)
  active    Boolean @default(true)
  progress  QuestProgress[]
}
model QuestProgress {
  id       String @id @default(cuid())
  userId   String
  user     User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  questId  String
  quest    Quest  @relation(fields: [questId], references: [id], onDelete: Cascade)
  value    Int    @default(0)
  claimed  Boolean @default(false)
  periodKey String                       // e.g. "2026-07-06" (daily) / "S3" (seasonal)
  @@unique([userId, questId, periodKey])
}

model Season {
  id        String   @id                 // "S3"
  name      String
  startsAt  DateTime
  endsAt    DateTime
  tiers     Json                          // [{tier, xp, freeReward, premiumReward}]
  progress  SeasonProgress[]
}
model SeasonProgress {
  id        String @id @default(cuid())
  userId    String
  user      User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  seasonId  String
  season    Season @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  xp        Int     @default(0)
  hasPass   Boolean @default(false)       // premium pass purchased (diamonds)
  claimed   Int[]                          // tier indices claimed
  @@unique([userId, seasonId])
}

// ---------- Notifications ----------
model Notification {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      String                        // friend_request | achievement | event | system
  title     String
  body      String?
  data      Json?                          // { requestId, questId, ... } for inline actions
  readAt    DateTime?
  createdAt DateTime @default(now())
  @@index([userId, readAt, createdAt])
}
```

## Redis key design (ephemeral / real-time)

| Key | Type | Purpose |
|-----|------|---------|
| `presence:<userId>` | string w/ TTL | online status; refreshed by socket heartbeat |
| `mm:queue:<mode>` | sorted set (score = trophies) | matchmaking pool; matched by nearest rating |
| `mm:lock:<userId>` | string w/ TTL | prevents double-queueing |
| `match:<matchId>:state` | JSON string | live authoritative `GameState` during play (also persisted to PG at start/end + periodically) |
| `room:<code>` | hash | private room lobby state (host, players, spectators, settings, locked, bans) |
| `socket.io` | pub/sub | Socket.IO Redis adapter for multi-instance broadcast |
| `ratelimit:<userId>:<action>` | counter w/ TTL | chat/action rate limiting |

## Seed data (`prisma/seed.ts`)

- The full **StoreItem catalog** from `ASSETS.md` (boards, skins, avatars, frames, bundles, season pass) with Gold/Diamond prices.
- Daily + seasonal **Quests**.
- One active **Season** with its tier table.
- A handful of **bot/seed users** across rank tiers to populate the leaderboard and matchmaking demos.
- A few **seeded finished Matches** for the logged-in demo user so Match History + Replay aren't empty (mirrors the prototype's seeded history).
