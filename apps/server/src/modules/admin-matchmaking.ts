import type { MatchMode, Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";

type HumanMatchmakingWindow = {
  since: Date;
  until: Date;
  mode?: Extract<MatchMode, "CASUAL" | "RANKED">;
};

/** Canonical human-vs-human matchmaking cohort for analytics and drill-down. */
export function humanMatchmakingWhere({ since, until, mode }: HumanMatchmakingWindow): Prisma.MatchWhereInput {
  return {
    origin: "MATCHMAKING",
    ...(mode ? { mode } : {}),
    startedAt: { gte: since, lte: until },
    NOT: { redId: { equals: prisma.match.fields.blueId } },
    red: { is: { isBot: false } },
    blue: { is: { isBot: false } },
  };
}

export function humanVsBotMatchmakingWhere({ since, until, mode }: HumanMatchmakingWindow): Prisma.MatchWhereInput {
  const window = {
    origin: "MATCHMAKING" as const,
    ...(mode ? { mode } : {}),
    startedAt: { gte: since, lte: until },
  };
  return {
    ...window,
    OR: [
      { red: { is: { isBot: false } }, blue: { is: { isBot: true } } },
      { red: { is: { isBot: true } }, blue: { is: { isBot: false } } },
    ],
  };
}
