import { env, features } from "../config/env.js";

/**
 * Send a transactional email via Resend. When RESEND_API_KEY is not set (dev, or
 * before the domain is verified), the email is logged to the console instead of
 * sent — so the register→verify flow is testable without keys. The verification
 * LINK is always logged in dev so you can click it locally.
 */
export async function sendEmail(to: string, subject: string, html: string, textLink?: string) {
  if (!features.email) {
    // eslint-disable-next-line no-console
    console.log(`\n[email:dev] to=${to} · ${subject}` + (textLink ? `\n[email:dev] link: ${textLink}\n` : "\n"));
    return { sent: false, dev: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`RESEND_${res.status}: ${body.slice(0, 200)}`);
  }
  return { sent: true, dev: false };
}

// ── Brand tokens (email-safe: no CSS vars, no webfonts — many clients strip both) ──
const C = {
  bg: "#0f0820", // page backdrop
  card: "#1b1030", // frame fill
  cardEdge: "#3a2557",
  gold: "#e8b84b",
  goldLt: "#f5d783",
  ink: "#e7ddf7",
  ink2: "#9a86bd",
  btnFrom: "#f0cf72",
  btnTo: "#c99a2e",
  btnText: "#3a2405",
};
const SITE = "https://filipinodama.com";
// Display serif / body sans web-SAFE stacks (Cinzel/Inter don't load in email).
const SERIF = "'Georgia','Times New Roman',serif";
const SANS = "'Helvetica Neue',Arial,sans-serif";

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));

/**
 * Shared, email-client-robust shell: table-based, inline styles only, dark card
 * on a dark backdrop, gold sun wordmark header + muted footer. `preheader` is the
 * hidden inbox-preview snippet. Body is trusted HTML built by the callers below.
 */
function shell(opts: { preheader: string; heading: string; body: string; cta?: { label: string; href: string }; footnote: string; fallbackLink?: string }): string {
  const { preheader, heading, body, cta, footnote, fallbackLink } = opts;
  const ctaHtml = cta
    ? `<!-- bulletproof gold button -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px;"><tr>
            <td align="center" bgcolor="${C.btnTo}" style="border-radius:9px;background:linear-gradient(180deg,${C.btnFrom},${C.btnTo});">
              <a href="${cta.href}" style="display:inline-block;padding:14px 30px;font-family:${SANS};font-size:15px;font-weight:800;letter-spacing:.3px;color:${C.btnText};text-decoration:none;border-radius:9px;">${esc(cta.label)}</a>
            </td>
          </tr></table>`
    : "";
  const fallbackHtml = fallbackLink
    ? `<p style="margin:12px 0 0;font-family:${SANS};font-size:11px;line-height:1.5;color:${C.ink2};word-break:break-all;">Or paste this link into your browser:<br><a href="${fallbackLink}" style="color:${C.gold};">${esc(fallbackLink)}</a></p>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"></head>
<body style="margin:0;padding:0;background:${C.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};font-size:1px;line-height:1px;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <!-- brand wordmark -->
        <tr><td align="center" style="padding:6px 0 20px;">
          <span style="font-family:${SERIF};font-size:13px;letter-spacing:3px;color:${C.gold};font-weight:700;">☀ FILIPINO DAMA</span>
        </td></tr>
        <!-- card -->
        <tr><td style="background:${C.card};border:1px solid ${C.cardEdge};border-radius:14px;padding:36px 34px;">
          <h1 style="margin:0 0 14px;font-family:${SERIF};font-size:24px;line-height:1.2;color:${C.goldLt};font-weight:700;">${esc(heading)}</h1>
          <div style="font-family:${SANS};font-size:15px;line-height:1.6;color:${C.ink};">${body}</div>
          ${ctaHtml}
          <p style="margin:18px 0 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${C.ink2};">${esc(footnote)}</p>
          ${fallbackHtml}
        </td></tr>
        <!-- footer -->
        <tr><td align="center" style="padding:22px 8px 4px;">
          <p style="margin:0;font-family:${SANS};font-size:11px;line-height:1.6;color:${C.ink2};">
            <a href="${SITE}" style="color:${C.gold};text-decoration:none;">filipinodama.com</a> · Strategy · Heritage · Victory<br>
            You received this because an account action was requested for this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function verifyEmailHtml(username: string, link: string) {
  return shell({
    preheader: "Confirm your email to start your climb up the ladder.",
    heading: "Confirm your email",
    body: `<p style="margin:0 0 12px;">Kumusta, <strong style="color:${C.goldLt};">${esc(username)}</strong>!</p>
           <p style="margin:0;">Verify your email to activate your account and start your climb up the FilipinoDama Royal ladder.</p>`,
    cta: { label: "Verify Email", href: link },
    footnote: "This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.",
    fallbackLink: link,
  });
}

export function resetEmailHtml(username: string, link: string) {
  return shell({
    preheader: "Reset your FilipinoDama Royal password.",
    heading: "Reset your password",
    body: `<p style="margin:0 0 12px;">Hi <strong style="color:${C.goldLt};">${esc(username)}</strong>,</p>
           <p style="margin:0;">We got a request to reset the password for your FilipinoDama Royal account. Click below to choose a new one.</p>`,
    cta: { label: "Reset Password", href: link },
    footnote: "This link expires soon. Didn't request a reset? You can ignore this email — your password won't change.",
    fallbackLink: link,
  });
}

/**
 * Welcome email — sent once, right after a player verifies their email. Points
 * them into the game (Play) so onboarding continues past the inbox.
 */
export function welcomeEmailHtml(username: string, playLink: string) {
  return shell({
    preheader: "Your account is verified — the board awaits.",
    heading: "Welcome to the board!",
    body: `<p style="margin:0 0 12px;">Kumusta, <strong style="color:${C.goldLt};">${esc(username)}</strong>! 🎉</p>
           <p style="margin:0 0 12px;">Your email is verified and your account is live. You're ready to claim your place among the legends of FilipinoDama Royal.</p>
           <p style="margin:0;">Play ranked matches to climb the ladder, earn trophies and gold, complete daily quests, and unlock premium cosmetics in the store. Your first move starts now.</p>`,
    cta: { label: "Play Now", href: playLink },
    footnote: "Strategy · Heritage · Victory — see you on the board.",
    fallbackLink: playLink,
  });
}

/**
 * Purchase receipt — sent after a successful in-game purchase. `items` are the
 * order lines; `total`+`currency` are what was spent (GOLD/DIAMONDS). No CTA.
 */
export function receiptEmailHtml(opts: {
  username: string;
  orderId: string;
  items: { name: string; price: number }[];
  total: number;
  currency: string; // "GOLD" | "DIAMONDS"
  when: Date;
}) {
  const { username, orderId, items, total, currency, when } = opts;
  const unit = currency === "DIAMONDS" ? "💎" : "🪙";
  const money = (n: number) => `${unit} ${n.toLocaleString()}`;
  const rows = items
    .map(
      (it) =>
        `<tr>
          <td style="padding:9px 0;border-top:1px solid ${C.cardEdge};font-family:${SANS};font-size:14px;color:${C.ink};">${esc(it.name)}</td>
          <td align="right" style="padding:9px 0;border-top:1px solid ${C.cardEdge};font-family:${SANS};font-size:14px;color:${C.goldLt};white-space:nowrap;">${money(it.price)}</td>
        </tr>`,
    )
    .join("");
  const body = `<p style="margin:0 0 14px;">Hi <strong style="color:${C.goldLt};">${esc(username)}</strong>, thanks for your purchase! Here's your receipt.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;">
      ${rows}
      <tr>
        <td style="padding:12px 0 0;border-top:2px solid ${C.gold};font-family:${SANS};font-size:15px;font-weight:800;color:${C.ink};">Total</td>
        <td align="right" style="padding:12px 0 0;border-top:2px solid ${C.gold};font-family:${SANS};font-size:15px;font-weight:800;color:${C.gold};white-space:nowrap;">${money(total)}</td>
      </tr>
    </table>
    <p style="margin:14px 0 0;font-family:${SANS};font-size:12px;color:${C.ink2};">Order <span style="color:${C.ink};">#${esc(orderId)}</span> · ${esc(when.toUTCString())}</p>
    <p style="margin:8px 0 0;">Your items are already in your inventory — equip them from Settings or the Store.</p>`;
  return shell({
    preheader: `Receipt for your FilipinoDama Royal purchase (${money(total)}).`,
    heading: "Your purchase receipt",
    body,
    footnote: "This is a record of an in-game purchase made with your account balance. Questions? Reply to this email.",
  });
}

/**
 * Ban / suspension notice — sent when a moderator suspends an account. States the
 * reason and, when the ban is temporary, when access is restored. No CTA.
 */
export function banEmailHtml(opts: { username: string; reason: string; until: Date | null }) {
  const { username, reason, until } = opts;
  const durationLine = until
    ? `<p style="margin:0 0 12px;">Your access is suspended until <strong style="color:${C.goldLt};">${esc(until.toUTCString())}</strong>.</p>`
    : `<p style="margin:0 0 12px;">Your access has been suspended <strong style="color:${C.goldLt};">indefinitely</strong>.</p>`;
  const body = `<p style="margin:0 0 12px;">Hi <strong style="color:${C.goldLt};">${esc(username)}</strong>,</p>
    <p style="margin:0 0 12px;">Your FilipinoDama Royal account has been suspended by our moderation team for violating our Community Guidelines.</p>
    ${durationLine}
    <div style="margin:6px 0 12px;padding:12px 14px;border-left:3px solid ${C.gold};background:rgba(232,184,75,.08);font-family:${SANS};font-size:14px;color:${C.ink};border-radius:6px;">
      <span style="color:${C.ink2};">Reason:</span> ${esc(reason)}
    </div>
    <p style="margin:0;">If you believe this was a mistake, you can appeal by replying to this email.</p>`;
  return shell({
    preheader: "Important: your FilipinoDama Royal account has been suspended.",
    heading: "Account suspended",
    body,
    footnote: "This action was taken to keep the community safe and fair for all players.",
  });
}
