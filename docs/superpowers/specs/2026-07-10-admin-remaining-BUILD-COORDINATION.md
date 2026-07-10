# Cross-spec build coordination (Support + Analytics + Tournaments on one branch)

The multi-agent review flagged that all 3 features edit the SAME shared files. When implemented
together (subagent-driven, one branch), these edits must COMPOSE, not collide. The controller
owns this coordination — it is NOT a per-feature spec concern.

## Shared files touched by >1 feature — how they compose

### 1. `apps/server/test/helpers.ts` — `truncateAll()` TRUNCATE list (HIGH)
Currently ONE fixed line (helpers.ts:54):
`TRUNCATE "Report","AuditLog","Message","ChannelMember","Channel" RESTART IDENTITY CASCADE`

All 3 features need to add tables. **Land ONE merged, deduped, UNCONDITIONAL list** (whichever
sub-build merges first writes it; the others build on it, NOT re-editing the line). Final list:

```
TRUNCATE "Report","AuditLog","Message","ChannelMember","Channel",
  "Ticket","Tournament","TournamentEntry","TournamentMatch","Match","LedgerEntry"
  RESTART IDENTITY CASCADE
```
- `Ticket` (support) — cascades to TicketMessage via FK.
- `Tournament`,`TournamentEntry`,`TournamentMatch` (tournaments).
- `Match` — needed by tournaments (tournament matches) AND analytics (match metrics). Include ONCE.
- `LedgerEntry` — needed UNCONDITIONALLY by BOTH analytics (exact faucet/sink assertions) and
  tournaments (entry-fee/refund/prize gold rows). **CRITICAL:** `LedgerEntry.userId` is a plain
  `@relation` (Restrict, NOT Cascade — schema.prisma:119-120), so deleting `t_user_` rows does
  NOT clear ledger rows. LedgerEntry must be in the TRUNCATE list explicitly, never "conditional
  on survivors."
- Also extend `seedUser` overrides with `email?: string | null` (support's null-email test needs it).

### 2. `apps/server/prisma/schema.prisma` — new models + User back-relations
- Support: `Ticket`, `TicketMessage` (+ User back-relations: `tickets Ticket[]`, and TicketMessage.author → a User back-relation).
- Tournaments: `Tournament`, `TournamentEntry`, `TournamentMatch` (+ User back-relations: created-by, entries).
- Each new model with a `User` relation REQUIRES the opposite field on `User` or `prisma validate` fails.
  Every sub-build adds its own back-relation fields to the User model — these are ADDITIVE and compose
  (different field names), but the 3 builds each append to the User relations block → coordinate so the
  merge is clean (append, don't reorder existing fields).

### 3. THREE additive migrations, one branch
Support / Analytics(none — read-only) / Tournaments each generate a migration. Analytics adds NO
schema (read-only). So 2 migrations: support's Ticket tables, tournaments' Tournament tables. Both
additive, independent, no ordering dependency. Generate each in its own sub-build; they apply in
timestamp order on deploy.

### 4. `apps/server/src/index.ts` — route registration
Each feature registers its plugin(s): `supportRoutes` + `adminTicketsRoutes`, `adminAnalyticsRoutes`,
`adminTournamentsRoutes`. All ADDITIVE (append registration lines near the other admin plugins).
Compose fine; just append.

### 5. `apps/admin/src/App.tsx` — nav + routes (3 stubs → real)
- `/support` → SUPPORT (matches existing nav min-role).
- `/analytics` → ECONOMY (matches existing nav min-role).
- `/tournaments` → ECONOMY (matches existing nav min-role).
Each swaps its Phase2 stub route → real page + drops its P2 flag. All 3 edit the NAV array + Routes +
imports. ADDITIVE per-line — compose, but 3 builds editing the same file = coordinate (append imports,
change only that feature's tuple/route). No role changes needed (all 3 already have the right min-role
in the nav; unlike campaigns which needed raising).

## Build-order recommendation
Because they share helpers.ts + schema.prisma + index.ts + App.tsx, DON'T run 3 fully-parallel
worktrees editing the same files — that reconverges into merge conflicts. Two clean options:
- **(A) Sequential-on-one-branch:** build feature 1 fully (incl. the merged truncateAll + its schema/
  registration), commit, then feature 2 builds on top (helpers.ts already has the merged list — it just
  confirms its tables are present), then feature 3. Each still subagent-driven + reviewed. Slower but
  zero cross-conflicts.
- **(B) Parallel server modules, serialized shared-file edits:** the independent NEW files (each
  feature's admin-*.ts module + page + tests) are built in parallel; the controller applies the shared-
  file edits (helpers.ts merged list, schema back-relations, index.ts registrations, App.tsx nav) ONCE,
  coordinated. Faster but the controller must sequence the shared edits.

RECOMMEND (A) sequential-on-one-branch for correctness (the shared files are small; the risk of a
3-way collision on helpers.ts/schema/App.tsx outweighs the parallelism gain). Order by size/risk:
Analytics (smallest, read-only, no migration) → Support (medium) → Tournaments (largest, money flows).
