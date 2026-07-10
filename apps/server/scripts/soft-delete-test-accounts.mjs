/**
 * soft-delete-test-accounts.mjs
 *
 * Removes throwaway TEST accounts from the public leaderboard by SOFT-deleting
 * them (sets `deletedAt`). The leaderboard/season queries already exclude
 * `deletedAt != null`, so the accounts vanish from the board immediately —
 * reversibly, with no data loss (unset `deletedAt` to restore).
 *
 * SAFETY:
 *  - Allowlist ONLY. It never pattern-matches usernames — it acts on the exact
 *    USERNAMES listed below and nothing else, so it can't sweep in a real player.
 *  - Dry-run by DEFAULT. It prints exactly what it WOULD change and exits.
 *    Pass `--confirm` to actually write.
 *  - Runs against whatever DATABASE_URL is set. To hit production, run it with
 *    the prod DATABASE_URL in the environment (e.g. via `railway run`).
 *
 * Usage (from apps/server):
 *   node -r dotenv/config scripts/soft-delete-test-accounts.mjs            # dry run
 *   node -r dotenv/config scripts/soft-delete-test-accounts.mjs --confirm  # apply
 *   node -r dotenv/config scripts/soft-delete-test-accounts.mjs --restore  # dry-run restore
 *   node -r dotenv/config scripts/soft-delete-test-accounts.mjs --restore --confirm
 *
 * To target production explicitly (does not read .env):
 *   railway run node scripts/soft-delete-test-accounts.mjs            # dry run vs prod
 *   railway run node scripts/soft-delete-test-accounts.mjs --confirm  # apply vs prod
 */
import { PrismaClient } from "@prisma/client";

// Exact usernames to soft-delete. Case-insensitive match is applied below.
// NOTE: `oxenjo30` is intentionally EXCLUDED — it showed as "(You)" and is
// presumed to be a real/primary account. Add/remove names deliberately.
const TEST_USERNAMES = [
  "st21435",
  "verify06095",
  "fid13938",
  "fv3955",
  "fv3974",
  "v4715",
  "stb1481",
  "rta1683",
  "rtb1683",
  "rtc1851",
  // EXCLUDED — verified real players, NOT test accounts (do not delete):
  //   "yukezz"           → real gmail (joseemmanuelmangaring2@gmail), real name
  //   "jonel macalisang" → not present in DB / real person's name
];

const CONFIRM = process.argv.includes("--confirm");
const RESTORE = process.argv.includes("--restore");

const prisma = new PrismaClient();

async function main() {
  const wanted = TEST_USERNAMES.map((n) => n.toLowerCase());

  // Case-insensitive lookup by username. We fetch first so we can show exactly
  // which real rows will be touched and flag any name that matched nothing.
  // The extra fields (email, wins/losses, created/last-seen) are DISCRIMINATORS
  // so a human can tell a throwaway test account from a valid registered player
  // BEFORE anything is deleted.
  const users = await prisma.user.findMany({
    where: { username: { in: wanted, mode: "insensitive" } },
    select: {
      id: true, username: true, displayName: true, trophies: true, isBot: true,
      deletedAt: true, email: true, emailVerified: true, wins: true, losses: true,
      createdAt: true, lastSeenAt: true,
    },
  });

  const foundNames = new Set(users.map((u) => u.username.toLowerCase()));
  const missing = wanted.filter((n) => !foundNames.has(n));

  const d = (dt) => (dt ? new Date(dt).toISOString().slice(0, 10) : "—");
  console.log(`\nMode: ${RESTORE ? "RESTORE (clear deletedAt)" : "SOFT-DELETE (set deletedAt)"} | ${CONFIRM ? "APPLY" : "DRY RUN"}`);
  console.log(`DB host: ${(process.env.DATABASE_URL || "").split("@")[1]?.split("/")[0] ?? "unknown"}`);
  console.log(`\nMatched ${users.length} of ${wanted.length} allowlisted usernames:`);
  console.log(`  ${"username".padEnd(18)} ${"troph".padStart(5)} ${"W/L".padStart(7)}  ${"email".padEnd(24)} verif  created     lastSeen    state`);
  for (const u of users) {
    const state = u.deletedAt ? `deleted@${d(u.deletedAt)}` : "active";
    const email = (u.email ?? "—").slice(0, 24);
    console.log(
      `  ${u.username.padEnd(18)} ${String(u.trophies).padStart(5)} ${`${u.wins}/${u.losses}`.padStart(7)}  ${email.padEnd(24)} ${u.emailVerified ? "yes" : "no "}    ${d(u.createdAt)}  ${d(u.lastSeenAt)}  ${state}`,
    );
  }
  if (missing.length) {
    console.log(`\nNOT FOUND (no such username — skipped): ${missing.join(", ")}`);
  }

  // Guard: refuse to touch any account flagged isBot (defense in depth — the
  // allowlist shouldn't contain bots, but never soft-delete an NPC by accident).
  const bots = users.filter((u) => u.isBot);
  if (bots.length) {
    console.log(`\nREFUSING: ${bots.length} matched rows are isBot=true and were excluded: ${bots.map((b) => b.username).join(", ")}`);
  }
  const targets = users.filter((u) => !u.isBot);

  if (!CONFIRM) {
    console.log(`\nDRY RUN — would ${RESTORE ? "restore" : "soft-delete"} ${targets.length} account(s). Re-run with --confirm to apply.`);
    return;
  }

  console.log(`\n=== APPLYING: ${RESTORE ? "restoring" : "SOFT-DELETING"} the following ${targets.length} account(s) ===`);
  for (const u of targets) console.log(`  • ${u.username} (troph=${u.trophies}, W/L=${u.wins}/${u.losses})`);

  const now = new Date();
  let changed = 0;
  for (const u of targets) {
    await prisma.user.update({
      where: { id: u.id },
      data: { deletedAt: RESTORE ? null : now },
    });
    changed++;
  }
  console.log(`\nDONE — ${RESTORE ? "restored" : "soft-deleted"} ${changed} account(s).`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
