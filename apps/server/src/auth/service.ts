import type { PrismaClient, User } from "@prisma/client";
import { containsProfanity } from "@dama/shared";
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
    // In-session sanction state so a signed-in user can be shown a banner. A
    // BAN is normally rejected at the auth guard (403), but if a ban is issued
    // mid-session the client sees banned=true on its next /me and can react; a
    // MUTE never blocks login, so this is the only way a muted user learns why
    // their chat is silenced. `until` is null for a permanent sanction.
    sanction: sanctionState(u),
  };
}

/** Derive the client-facing sanction state from the User's mute/ban columns. */
function sanctionState(u: User): {
  muted: boolean;
  mutedUntil: string | null;
  banned: boolean;
  bannedUntil: string | null;
} {
  const now = new Date();
  const PERMANENT_MS = new Date("2999-01-01T00:00:00Z").getTime();
  const muted = !!(u.mutedUntil && u.mutedUntil > now);
  const banned = !!(u.bannedUntil && u.bannedUntil > now);
  return {
    muted,
    mutedUntil: muted && u.mutedUntil!.getTime() !== PERMANENT_MS ? u.mutedUntil!.toISOString() : null,
    banned,
    bannedUntil: banned && u.bannedUntil!.getTime() !== PERMANENT_MS ? u.bannedUntil!.toISOString() : null,
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
  let equippedFrame: string | undefined;
  const freeEmoteIds: string[] = [];
  for (const item of defaults) {
    // Grant every free item to the inventory. For BOARD/SKIN/FRAME the single
    // free default is auto-equipped. For AVATAR there are several free starters,
    // so we only MARK the inventory equipped flag for the chosen default one —
    // the others are owned-but-not-equipped, ready to pick in the profile modal.
    const isDefaultAvatar = item.type === "AVATAR" && item.id === DEFAULT_AVATAR_KEY;
    const equipped =
      item.type === "BOARD" || item.type === "SKIN" || item.type === "FRAME" ||
      item.type === "EMOTE" || isDefaultAvatar;
    await prisma.inventoryItem.upsert({
      where: { userId_itemId: { userId, itemId: item.id } },
      update: {},
      create: { userId, itemId: item.id, equipped },
    });
    if (item.type === "BOARD" && !equippedBoard) equippedBoard = item.id;
    if (item.type === "SKIN" && !equippedSkin) equippedSkin = item.id;
    // The free default FRAME (owner directive 2026-07-18: every player starts
    // with the round house "laurel" frame, so no avatar is ever bare). Generic:
    // picks the first free FRAME by sortOrder, which the seed makes laurel.
    if (item.type === "FRAME" && !equippedFrame) equippedFrame = item.id;
    if (isDefaultAvatar) equippedAvatar = item.id;
    if (item.type === "EMOTE") freeEmoteIds.push(item.id);
  }
  const equippedEmotes = freeEmoteIds.slice(0, 6); // default loadout, respects the 6-slot cap
  if (equippedBoard || equippedSkin || equippedAvatar || equippedFrame || equippedEmotes.length) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(equippedBoard ? { equippedBoard } : {}),
        ...(equippedSkin ? { equippedSkin } : {}),
        // avatarUrl stores the bare avatar key (see AvatarPickerModal.avatarValue).
        ...(equippedAvatar ? { avatarUrl: equippedAvatar } : {}),
        // frameId stores the FRAME item id (users.ts equip writes the same).
        ...(equippedFrame ? { frameId: equippedFrame } : {}),
        ...(equippedEmotes.length ? { equippedEmotes } : {}),
      },
    });
  }
}

export async function register(prisma: PrismaClient, input: { email: string; password: string; username: string }) {
  const email = input.email.toLowerCase();
  // NOTE on soft-deleted accounts: this lookup is deliberately NOT scoped to
  // `deletedAt: null`. User.email carries a DB unique constraint, so filtering
  // here would only move the failure from a clean 409 to a constraint violation.
  //
  // The address is therefore unavailable while the deleted account is still in
  // its grace period, and frees up when account-purge.ts hard-deletes the row.
  // Before that job existed this was a PERMANENT lockout — delete your account
  // and you could never sign up with that address again. It is now bounded by
  // PURGE_AFTER_DAYS. Releasing it sooner would mean scrubbing the email at
  // soft-delete time, which throws away the record the grace period exists to
  // hold.
  if (await prisma.user.findUnique({ where: { email } })) throw err.conflict("EMAIL_TAKEN", "Email already registered");
  if (await prisma.user.findUnique({ where: { username: input.username } }))
    throw err.conflict("USERNAME_TAKEN", "Username already taken");
  if (containsProfanity(input.username))
    throw err.badRequest("INAPPROPRIATE_LANGUAGE", "That name contains inappropriate language. Please choose another.");

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
  // A soft-deleted account is gone as far as sign-in is concerned. The SAME
  // generic error as a wrong password is deliberate — a distinct "account
  // deleted" response would confirm the address was registered — and it is
  // checked BEFORE the password so a deleted account can't act as a
  // credential-verification oracle either.
  //
  // requireAuth, the socket guard and rotateSession already reject on deletedAt,
  // so this was never an authorization bypass; without it, login simply issued
  // fresh cookies for an account every other layer would immediately deny,
  // leaving the client "signed in" and instantly signed out with no way to
  // recover.
  if (user.deletedAt) throw err.unauthorized("BAD_CREDENTIALS", "Wrong email or password");
  // Verify the password FIRST so a wrong password on a banned account returns the
  // SAME generic BAD_CREDENTIALS as any other wrong password — never an oracle
  // that reveals "this email exists and is banned" before authentication.
  if (!(await verifyPassword(input.password, user.passwordHash)))
    throw err.unauthorized("BAD_CREDENTIALS", "Wrong email or password");
  // Only AFTER a correct password do we reveal the sanction state, so a
  // legitimately-authenticated banned user still learns they're suspended.
  if (user.bannedUntil && user.bannedUntil > new Date()) throw err.forbidden("BANNED", "This account is suspended");
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

const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;

/**
 * Everything the account screens need to render identically on web and Android.
 *
 * Derived on the SERVER and returned from /api/auth/me rather than assembled
 * client-side: the requirement is that this state is the same wherever you sign
 * in, and two clients each working out "can I unlink Google?" from their own
 * cache is exactly how they drift apart.
 */
export async function accountState(prisma: PrismaClient, userId: string) {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true, emailVerified: true, passwordHash: true, isGuest: true,
      pendingEmail: true, pendingEmailExpires: true,
      oauthAccounts: { select: { provider: true } },
    },
  });
  const providers = u.oauthAccounts.map((a) => a.provider);
  const hasPassword = !!u.passwordHash;
  const pendingLive = !!u.pendingEmail && !!u.pendingEmailExpires && u.pendingEmailExpires > new Date();
  return {
    email: u.email,
    emailVerified: !!u.emailVerified,
    hasPassword,
    linkedProviders: providers,
    pendingEmail: pendingLive ? u.pendingEmail : null,
    // The client must not offer an unlink that would lock the player out, and
    // must not have to derive that rule itself.
    canUnlink: providers.length > 1 || hasPassword,
    canChangeEmail: !u.isGuest,
  };
}

/**
 * Stage an email change. The address is NOT applied here — see
 * User.pendingEmail. Requires the current password when the account has one, so
 * a stolen session alone cannot begin moving the account elsewhere.
 */
export async function requestEmailChange(
  prisma: PrismaClient,
  userId: string,
  newEmailRaw: string,
  currentPassword?: string,
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.isGuest) throw err.badRequest("GUEST_ACCOUNT", "Create an account before changing your email.");

  // Re-authenticate. OAuth-only accounts have no password to check; for them the
  // link sent to the NEW address is the only proof of ownership, which is why
  // that link is what actually applies the change.
  if (user.passwordHash) {
    if (!currentPassword) throw err.badRequest("PASSWORD_REQUIRED", "Enter your current password to change your email.");
    if (!(await verifyPassword(currentPassword, user.passwordHash)))
      throw err.badRequest("BAD_PASSWORD", "That password is incorrect.");
  }

  const newEmail = newEmailRaw.trim().toLowerCase();
  if (newEmail === user.email?.toLowerCase())
    throw err.badRequest("SAME_EMAIL", "That is already your email address.");
  // Same non-deletedAt-scoped check register() uses: the address stays
  // unavailable while a soft-deleted account still holds it.
  if (await prisma.user.findUnique({ where: { email: newEmail } }))
    throw err.conflict("EMAIL_TAKEN", "That email is already in use.");

  const pendingEmailToken = opaqueToken();
  await prisma.user.update({
    where: { id: userId },
    data: { pendingEmail: newEmail, pendingEmailToken, pendingEmailExpires: new Date(Date.now() + EMAIL_CHANGE_TTL_MS) },
  });
  const link = `${env.WEB_ORIGIN}/verify-email-change?token=${pendingEmailToken}`;
  // Sent to the NEW address ONLY — mailing the old one would prove nothing
  // about who controls the new one.
  await sendEmail(newEmail, "Confirm your new FilipinoDama Royal email", verifyEmailHtml(user.username, link), link);
  return { pendingEmail: newEmail };
}

/** Apply a staged email change; the link's holder proves they own the address. */
export async function confirmEmailChange(prisma: PrismaClient, token: string) {
  const user = await prisma.user.findUnique({ where: { pendingEmailToken: token } });
  if (!user || !user.pendingEmail || !user.pendingEmailExpires || user.pendingEmailExpires < new Date())
    throw err.badRequest("BAD_TOKEN", "That confirmation link is invalid or has expired.");

  // Re-check at APPLY time, not only at request time: someone else may have
  // taken the address during the hour the link was valid.
  const clash = await prisma.user.findUnique({ where: { email: user.pendingEmail } });
  if (clash && clash.id !== user.id) {
    await prisma.user.update({
      where: { id: user.id },
      data: { pendingEmail: null, pendingEmailToken: null, pendingEmailExpires: null },
    });
    throw err.conflict("EMAIL_TAKEN", "That email was claimed by another account. Try a different one.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      email: user.pendingEmail,
      // Confirmed by clicking a link sent to it — that IS the verification.
      emailVerified: new Date(),
      pendingEmail: null,
      pendingEmailToken: null,
      pendingEmailExpires: null,
    },
  });
  return { email: user.pendingEmail };
}

/**
 * Attach a verified OAuth identity to the CURRENT account.
 *
 * The gap this closes: findOrCreateOAuthUser links only by MATCHING EMAIL, so a
 * player whose Google address differs from their account email silently got a
 * SECOND account — separate trophies and inventory, no wallet merge, and no
 * sign anything had gone wrong. Linking from a signed-in session removes the
 * guesswork.
 */
export async function linkOAuthAccount(
  prisma: PrismaClient,
  userId: string,
  provider: string,
  providerId: string,
) {
  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerId: { provider, providerId } },
    select: { userId: true },
  });
  if (existing) {
    if (existing.userId === userId) return { linked: true, alreadyLinked: true };
    // Never re-point someone else's Google identity at this account — that is
    // account takeover, not linking.
    throw err.conflict("PROVIDER_IN_USE", "That Google account is already linked to a different player.");
  }
  await prisma.oAuthAccount.create({ data: { provider, providerId, userId } });
  return { linked: true, alreadyLinked: false };
}

/** Detach a provider, refusing anything that would leave no way back in. */
export async function unlinkOAuthAccount(prisma: PrismaClient, userId: string, provider: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { passwordHash: true, oauthAccounts: { select: { provider: true } } },
  });
  const links = user.oauthAccounts.map((a) => a.provider);
  if (!links.includes(provider)) throw err.badRequest("NOT_LINKED", "That account isn't connected.");
  // The point of the guard: an OAuth-only player who unlinks their only provider
  // has no password to fall back on and can never sign in again.
  if (!user.passwordHash && links.length === 1)
    throw err.badRequest("LAST_SIGN_IN_METHOD", "Set a password first — this is your only way to sign in.");
  await prisma.oAuthAccount.deleteMany({ where: { userId, provider } });
  return { unlinked: true };
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
