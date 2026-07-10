import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { getBool, getConfig, invalidateConfig } from "../src/lib/config-service.js";
import { truncateAll } from "./helpers.js";

afterEach(async () => { await prisma.config.deleteMany({ where: { key: { startsWith: "T_" } } }); invalidateConfig(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("config-service", () => {
  it("reads a bool row, falls back when unset, and reflects updates after invalidate", async () => {
    expect(await getBool("T_FLAG", false)).toBe(false); // unset → fallback
    await prisma.config.create({ data: { key: "T_FLAG", value: "true", type: "bool", category: "flag", label: "t" } });
    invalidateConfig("T_FLAG");
    expect(await getBool("T_FLAG", false)).toBe(true);
    await prisma.config.update({ where: { key: "T_FLAG" }, data: { value: "false" } });
    invalidateConfig("T_FLAG");
    expect(await getBool("T_FLAG", true)).toBe(false);
    expect(await getConfig("T_MISSING")).toBeNull();
  });
});
