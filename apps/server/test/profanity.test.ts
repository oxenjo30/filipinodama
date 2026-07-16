import { describe, it, expect } from "vitest";
import { containsProfanity, maskProfanity } from "@dama/shared";

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
