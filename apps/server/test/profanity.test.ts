import { describe, it, expect, afterEach, afterAll } from "vitest";
import { containsProfanity, maskProfanity } from "@dama/shared";
import { prisma } from "../src/db/client.js";
import { register } from "../src/auth/service.js";
import { ApiError } from "../src/lib/errors.js";
import { truncateAll } from "./helpers.js";

describe("containsProfanity", () => {
  it("flags strong English + Filipino + Cebuano profanity", () => {
    for (const w of ["fuck", "shit", "putangina", "gago", "yawa", "bilat"]) {
      expect(containsProfanity(`hey ${w} lol`)).toBe(true);
    }
  });
  it("flags leetspeak + repeats + intra-token punctuation", () => {
    for (const w of ["sh1t", "f.u.c.k", "fuuuck", "p@kyu", "g4go"]) {
      expect(containsProfanity(w)).toBe(true);
    }
  });
  it("does NOT flag innocent words or multi-word text (Scunthorpe guard)", () => {
    for (const s of ["assassin", "Scunthorpe", "class sizes", "pass the ball", "analysis", "bass", "grape juice"]) {
      expect(containsProfanity(s)).toBe(false);
    }
  });
});

describe("maskProfanity", () => {
  it("masks the profane token, keeps the rest", () => {
    expect(maskProfanity("you gago idiot")).toBe("you **** idiot");
    expect(maskProfanity("nice game")).toBe("nice game");
  });
});

describe("register() username profanity gate", () => {
  afterEach(async () => {
    // containsProfanity() matches whole tokens, so the profane test username
    // below ("gago") has no "t_user_" prefix and truncateAll() won't catch it
    // — delete it explicitly so no row leaks into the next test file.
    await prisma.user.deleteMany({ where: { username: "gago" } });
    await truncateAll();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects a profane username with INAPPROPRIATE_LANGUAGE", async () => {
    await expect(
      register(prisma, {
        email: `t_user_profane_${Date.now()}@example.com`,
        password: "correcthorsebatterystaple",
        // must be an exact profane token — containsProfanity() only matches
        // whole whitespace-delimited tokens, not substrings within a larger one.
        username: "gago",
      }),
    ).rejects.toMatchObject({ code: "INAPPROPRIATE_LANGUAGE" } satisfies Partial<ApiError>);
  });

  it("allows a clean username to register successfully", async () => {
    const username = `t_user_clean_${Date.now()}`;
    const user = await register(prisma, {
      email: `t_user_clean_${Date.now()}@example.com`,
      password: "correcthorsebatterystaple",
      username,
    });
    expect(user.username).toBe(username);
  });
});
