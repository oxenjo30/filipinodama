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

export function verifyEmailHtml(username: string, link: string) {
  return `<div style="font-family:Inter,Arial,sans-serif;background:#160b28;color:#efe7fb;padding:32px;border-radius:12px">
    <h1 style="color:#f5d783;font-family:Cinzel,serif">FilipinoDama Royal</h1>
    <p>Kumusta, <b>${username}</b>! Confirm your email to start your climb up the ladder.</p>
    <p><a href="${link}" style="display:inline-block;background:linear-gradient(180deg,#f0cf72,#c99a2e);color:#3a2405;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:800">Verify Email</a></p>
    <p style="color:#9a86bd;font-size:12px">If the button doesn't work, paste this link: ${link}</p>
  </div>`;
}

export function resetEmailHtml(username: string, link: string) {
  return `<div style="font-family:Inter,Arial,sans-serif;background:#160b28;color:#efe7fb;padding:32px;border-radius:12px">
    <h1 style="color:#f5d783;font-family:Cinzel,serif">Reset your password</h1>
    <p>Hi <b>${username}</b>, we got a request to reset your FilipinoDama Royal password.</p>
    <p><a href="${link}" style="display:inline-block;background:linear-gradient(180deg,#f0cf72,#c99a2e);color:#3a2405;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:800">Reset Password</a></p>
    <p style="color:#9a86bd;font-size:12px">Didn't request this? You can ignore this email.</p>
  </div>`;
}
