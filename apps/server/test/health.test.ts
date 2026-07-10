import { describe, it, expect } from "vitest";
import { buildTestApp } from "./helpers.js";

describe("health", () => {
  it("responds ok", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    await app.close();
  });
});
