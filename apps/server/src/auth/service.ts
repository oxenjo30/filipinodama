import type { PrismaClient, User } from "@prisma/client";
import { hashPassword, verifyPassword, opaqueToken, randomTag, newRefreshToken } from "./tokens.js";
import { err } from "../lib/errors.js";
import { env } from "../config/env.js";
import { sendEmail, verifyEmailHtml, resetEmailHtml, welcomeEmailHtml } from "../lib/email.js";

const VERIFY_TTL_MS = 24 * 3600 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

/** Public shape of a user returned to the client (never the hash/tokens). */
export function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    emailVerified: !!u.emailVerified,
    isGuest: u.isGuest,
    username: u.username,
    displayName: u.displayName,
    tag: u.tag,
    bio: u.bio,
    avatarUrl: u.avatarUrl,
    countryCode: u.countryCode,
    trophies: u.trophies,
    gold: u.gold,
    diamonds: u.diamonds,
    rankTier: u.rankTier,
    equippedBoard: u.equippedBoard,
    equippedSkin: u.equippedSkin,
    equippedEmotes: u.equippedEmotes,
    frameId: u.frameId,
    wins: u.wins,
    losses: u.losses,
    draws: u.draws,
    streak: u.streak,
    adminRole: u.adminRole,
  };
}

async function uniqueTag(prisma: PrismaClient): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const tag = randomTag();
    const clash = await prisma.user.findUnique({ where: { tag } });
    if (!clash) return tag;
  }
  return "#" + Date.now().toString().slice(-4);
}

/**
 * Give a new user the free default cosmetics they should always own: every
 * StoreItem priced at 0 gold (the default marble board + classic skin), added
 * to their inventory and equipped. Idempotent (skips items already owned).
 */
/** The avatar every new player starts equipped with (one of the free starters). */
const DEFAULT_AVATAR_KEY = "katipunero";

export async function grantDefaults(prisma: PrismaClient, userId: string) {
  const defaults = await prisma.storeItem.findMany({
    where: { active: true, priceGold: 0, priceDiamonds: null },
    orderBy: { sortOrder: "asc" },
  });
  let equippedBoard: string | undefined;
  let equippedSkin: string | undefined;
  let equippedAvatar: string | undefined;
  const freeEmoteIds: string[] = [];
  for (const item of defaults) {
    // Grant every free item to the inventory. For BOARD/SKIN the single default
    // is auto-equipped. For AVATAR there are several free starters, so we only
    // MARK the inventory equipped flag for the chosen default one — the others
    // are owned-but-not-equipped, ready to pick in the profile Avatar modal.
    const isDefaultAvatar = item.type === "AVATAR" && item.id === DEFAULT_AVATAR_KEY;
    const equipped =
      item.type === "BOARD" || item.type === "SKIN" || item.type === "EMOTE" || isDefaultAvatar;
    await prisma.inventoryItem.upsert({
      where: { userId_itemId: { userId, itemId: item.id } },
      update: {},
      create: { userId, itemId: item.id, equipped },
    });
    if (item.type === "BOARD" && !equippedBoard) equippedBoard = item.id;
    if (item.type === "SKIN" && !equippedSkin) equippedSkin = item.id;
    if (isDefaultAvatar) equippedAvatar = item.id;
    if (item.type === "EMOTE") freeEmoteIds.push(item.id);
  }
  const equippedEmotes = freeEmoteIds.slice(0, 6); // default loadout, respects the 6-slot cap
  if (equippedBoard || equippedSkin || equippedAvatar || equippedEmotes.length) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(equippedBoard ? { equippedBoard } : {}),
        ...(equippedSkin ? { equippedSkin } : {}),
        // avatarUrl stores the bare avatar key (see AvatarPickerModal.avatarValue).
        ...(equippedAvatar ? { avatarUrl: equippedAvatar } : {}),
        ...(equippedEmotes.length ? { equippedEmotes } : {}),
      },
    });
  }
}

export async function register(prisma: PrismaClient, input: { email: string; password: string; username: string }) {
  const email = input.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) throw err.conflict("EMAIL_TAKEN", "Email already registered");
  if (await prisma.user.findUnique({ where: { username: input.username } }))
    throw err.conflict("USERNAME_TAKEN", "Username already taken");

  const passwordHash = await hashPassword(input.password);
  const verifyToken = opaqueToken();
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      username: input.username,
      displayName: input.username,
      tag: await uniqueTag(prisma),
      verifyToken,
      verifyExpires: new Date(Date.now() + VERIFY_TTL_MS),
    },
  });

  await grantDefaults(prisma, user.id);

  const link = `${env.WEB_ORIGIN}/verify?token=${verifyToken}`;
  await sendEmail(email, "Verify your FilipinoDama Royal account", verifyEmailHtml(input.username, link), link);
  return prisma.user.findUniqueOrThrow({ where: { id: user.id } });
}

export async function verifyEmail(prisma: PrismaClient, token: string) {
  const user = await prisma.user.findUnique({ where: { verifyToken: token } });
  if (!user || !user.verifyExpires || user.verifyExpires < new Date())
    throw err.badRequest("BAD_TOKEN", "Verification link invalid or expired");
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: new Date(), verifyToken: null, verifyExpires: null },
  });
  // Fire the one-time Welcome email now the account is live. Best-effort: a mail
  // failure must never block the (already-committed) verification.
  if (updated.email) {
    try {
      await sendEmail(
        updated.email,
        "Welcome to FilipinoDama Royal",
        welcomeEmailHtml(updated.username, `${env.WEB_ORIGIN}/play`),
      );
    } catch {
      /* non-fatal — verification already succeeded */
    }
  }
  return updated;
}

export async function login(prisma: PrismaClient, input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user || !user.passwordHash) throw err.unauthorized("BAD_CREDENTIALS", "Wrong email or password");
  if (user.bannedUntil && user.bannedUntil > new Date()) throw err.forbidden("BANNED", "This account is suspended");
  if (!(await verifyPassword(input.password, user.passwordHash)))
    throw err.unauthorized("BAD_CREDENTIALS", "Wrong email or password");
  return user;
}

export async function createGuest(prisma: PrismaClient) {
  const n = Math.floor(100000 + Math.random() * 900000);
  const user = await prisma.user.create({
    data: {
      isGuest: true,
      username: `guest_${n}`,
      displayName: `Guest ${n}`,
      tag: await uniqueTag(prisma),
    },
  });
  await grantDefaults(prisma, user.id);
  return prisma.user.findUniqueOrThrow({ where: { id: user.id } });
}

/** Issue a refresh session row; returns the raw token to set as a cookie. */
export async function startSession(prisma: PrismaClient, userId: string, userAgent?: string) {
  const refreshToken = newRefreshToken();
  await prisma.session.create({
    data: {
      userId,
      refreshToken,
      userAgent,
      expiresAt: new Date(Date.now() + 30 * 864e5),
    },
  });
  return refreshToken;
}

/** Rotate: validate old refresh token, delete it, issue a new one. */
export async function rotateSession(prisma: PrismaClient, oldToken: string, userAgent?: string) {
  const session = await prisma.session.findUnique({ where: { refreshToken: oldToken }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) throw err.unauthorized("BAD_REFRESH", "Session expired");
  // A ban/delete after login must stop refresh from minting fresh access tokens.
  if (session.user.deletedAt) {
    await prisma.session.deleteMany({ where: { userId: session.userId } });
    throw err.unauthorized("ACCOUNT_GONE", "This account no longer exists");
  }
  if (session.user.bannedUntil && session.user.bannedUntil > new Date())
    throw err.forbidden("BANNED", "This account is suspended");
  await prisma.session.delete({ where: { id: session.id } });
  const refreshToken = await startSession(prisma, session.userId, userAgent);
  return { user: session.user, refreshToken };
}

export async function endSession(prisma: PrismaClient, token?: string) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { refreshToken: token } });
}

export async function requestPasswordReset(prisma: PrismaClient, email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Always succeed silently (don't leak which emails exist).
  if (!user || !user.email) return;
  const resetToken = opaqueToken();
  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken, resetExpires: new Date(Date.now() + RESET_TTL_MS) },
  });
  const link = `${env.WEB_ORIGIN}/reset?token=${resetToken}`;
  await sendEmail(user.email, "Reset your FilipinoDama Royal password", resetEmailHtml(user.username, link), link);
}

export async function resetPassword(prisma: PrismaClient, token: string, password: string) {
  const user = await prisma.user.findUnique({ where: { resetToken: token } });
  if (!user || !user.resetExpires || user.resetExpires < new Date())
    throw err.badRequest("BAD_TOKEN", "Reset link invalid or expired");
  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetToken: null, resetExpires: null },
  });
  // Invalidate all sessions on password change.
  await prisma.session.deleteMany({ where: { userId: user.id } });
}
