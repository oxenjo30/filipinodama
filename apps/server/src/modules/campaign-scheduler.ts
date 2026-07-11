import { prisma } from "../db/client.js";
import { audit } from "../lib/audit.js";
import { fanOutNotifications } from "./admin-campaigns.js";

/**
 * Due-campaign poller — the server-side half of the admin "Schedule" button.
 * Admins scheduling a campaign only ever creates a `status:"scheduled"` +
 * `scheduledFor` Campaign row (admin-campaigns.ts); nothing sends it without
 * this running. Started from `main()` in index.ts on a 60s setInterval — NOT
 * from buildApp(), so the test harness never spawns a live interval.
 *
 * Concurrency-safe: each due campaign is claimed with an atomic
 * `updateMany({ where: { status: "scheduled" }, data: { status: "sending" } })`
 * — only the caller that flips the row wins, so two overlapping poller ticks
 * (or a test calling runDueCampaigns() twice concurrently) can never fan out
 * the same campaign's notifications twice. A campaign whose fan-out throws
 * (e.g. EMPTY_SEGMENT) is left at "failed" rather than silently retried
 * forever every 60s; it also does not block any other due campaign in the
 * same run (each is wrapped independently).
 */
export async function runDueCampaigns(now: Date = new Date()): Promise<void> {
  const due = await prisma.campaign.findMany({
    where: { status: "scheduled", scheduledFor: { lte: now } },
    select: { id: true },
  });

  for (const { id } of due) {
    try {
      await runOne(id);
    } catch (e) {
      console.error(`[campaign-scheduler] campaign ${id} failed`, e);
    }
  }
}

async function runOne(id: string): Promise<void> {
  // Atomic claim: only the caller that actually flips scheduled -> sending
  // proceeds to fan out. Any other concurrent caller (or a second poller
  // tick) sees count 0 and skips it.
  const claim = await prisma.campaign.updateMany({ where: { id, status: "scheduled" }, data: { status: "sending" } });
  if (claim.count === 0) return;

  const camp = await prisma.campaign.findUnique({ where: { id } });
  if (!camp) return;

  try {
    const reach = await fanOutNotifications(camp.segment, camp.title, camp.body);
    await prisma.campaign.update({ where: { id }, data: { status: "sent", reach } });
    // sentById can be null if the scheduling admin's account was later deleted
    // (Campaign.sentById is onDelete: SetNull) — audit rows require an actorId,
    // so fall back to the campaign id itself rather than skip the audit entirely.
    await audit(prisma, {
      actorId: camp.sentById ?? `campaign:${id}`,
      action: "campaign.send",
      targetType: "campaign",
      targetId: id,
      after: { segment: camp.segment, channel: camp.channel, reach },
      reason: camp.title,
    });
  } catch (e) {
    // Leave it claimed-but-failed so it's not retried forever every 60s and
    // doesn't masquerade as still "scheduled" — and don't let it block
    // other due campaigns in this run.
    await prisma.campaign.update({ where: { id }, data: { status: "failed" } }).catch(() => {});
    throw e;
  }
}
