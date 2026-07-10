import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";

// Season isn't in truncateAll()'s TRUNCATE list, so this file cleans up its
// own rows to avoid leaking Season/SeasonProgress rows across test files.
afterEach(async () => {
  await prisma.season.deleteMany({ where: { id: { startsWith: "S_test_" } } });
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

let seasonSeq = 0;
async function seedSeason(extra: Record<string, unknown> = {}) {
  seasonSeq += 1;
  return prisma.season.create({
    data: {
      id: `S_test_${seasonSeq}_${process.pid}`,
      name: "Founders Season",
      startsAt: new Date("2026-01-01T00:00:00Z"),
      endsAt: new Date("2026-03-01T00:00:00Z"),
      tiers: [],
      ...extra,
    },
  });
}

describe("admin liveops seasons — number + endsLabel", () => {
  it("POST create with number + endsLabel persists them; GET list shows them", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/liveops/seasons",
      headers: { cookie },
      payload: {
        name: "Rainy Season",
        number: 3,
        endsLabel: "Ends in 12 days",
        startsAt: "2026-07-01T00:00:00Z",
        endsAt: "2026-08-01T00:00:00Z",
        reason: "launch season 3",
      },
    });
    expect(res.statusCode).toBe(200);
    const { id } = res.json().data;
    expect(id).toBeTruthy();

    const row = await prisma.season.findUnique({ where: { id } });
    expect(row!.number).toBe(3);
    expect(row!.endsLabel).toBe("Ends in 12 days");

    const list = await app.inject({ method: "GET", url: "/api/admin/liveops/seasons", headers: { cookie } });
    expect(list.statusCode).toBe(200);
    const item = list.json().data.items.find((i: { id: string }) => i.id === id);
    expect(item).toBeTruthy();
    expect(item.number).toBe(3);
    expect(item.endsLabel).toBe("Ends in 12 days");

    await prisma.season.delete({ where: { id } });
    await app.close();
  });

  it("PATCH updates number + endsLabel", async () => {
    const app = await buildTestApp();
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });
    const season = await seedSeason({ number: 1, endsLabel: "Ends soon" });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/liveops/seasons/${season.id}`,
      headers: { cookie },
      payload: { number: 2, endsLabel: "Ends in 3 days", reason: "bump season number" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(season.id);

    const after = await prisma.season.findUnique({ where: { id: season.id } });
    expect(after!.number).toBe(2);
    expect(after!.endsLabel).toBe("Ends in 3 days");
    // untouched fields persist
    expect(after!.name).toBe("Founders Season");

    const audits = await prisma.auditLog.findMany({ where: { action: "season.update", targetId: season.id } });
    expect(audits.length).toBe(1);
    expect((audits[0]!.after as { number: number }).number).toBe(2);
    expect((audits[0]!.after as { endsLabel: string }).endsLabel).toBe("Ends in 3 days");

    await app.close();
  });

  it("GET list returns number + endsLabel as null when unset", async () => {
    const app = await buildTestApp();
    const support = await seedUser({ adminRole: "SUPPORT" });
    const cookie = authFor({ sub: support.id, adminRole: "SUPPORT" });
    const season = await seedSeason();

    const res = await app.inject({ method: "GET", url: "/api/admin/liveops/seasons", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const item = res.json().data.items.find((i: { id: string }) => i.id === season.id);
    expect(item).toBeTruthy();
    expect(item.number).toBeNull();
    expect(item.endsLabel).toBeNull();

    await app.close();
  });
});
