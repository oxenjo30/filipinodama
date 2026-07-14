import { createSign } from "node:crypto";
import { getServiceAccount } from "./play-billing-config.js";

/**
 * play-verify — verifies a Google Play in-app purchase against the Play
 * Developer API, using the admin-configured service account. Zero extra
 * dependencies: we mint a signed JWT (RS256) from the service-account private
 * key with Node's crypto, exchange it for an OAuth access token, then call
 * androidpublisher purchases.products.get. This is exactly what
 * google-auth-library does under the hood, kept dependency-free.
 *
 * Docs: https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products/get
 */

const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Mint + exchange a service-account JWT for a short-lived access token. */
async function getAccessToken(nowSec: number): Promise<{ token: string } | { error: string }> {
  const sa = await getServiceAccount();
  if (!sa) return { error: "Play service account not configured." };

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.clientEmail,
      scope: SCOPE,
      aud: sa.tokenUri,
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );
  const signingInput = `${header}.${claim}`;
  let signature: string;
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    signature = base64url(signer.sign(sa.privateKey));
  } catch {
    return { error: "Failed to sign with the service-account private key." };
  }
  const assertion = `${signingInput}.${signature}`;

  let res: Response;
  try {
    res = await fetch(sa.tokenUri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Token request failed." };
  }
  if (!res.ok) {
    return { error: `Token endpoint returned ${res.status}.` };
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) return { error: "Token endpoint returned no access_token." };
  return { token: json.access_token };
}

/**
 * Admin "Test connection": verify the stored service account can obtain a Play
 * Developer API access token. Does not touch a purchase — just proves the
 * credential authenticates. Returns a real status, never a fabricated success.
 */
export async function testPlayServiceAccount(
  nowSec: number,
): Promise<{ status: "ok" | "not_configured" | "fail"; detail?: string }> {
  const sa = await getServiceAccount();
  if (!sa) return { status: "not_configured" };
  const tok = await getAccessToken(nowSec);
  if ("error" in tok) return { status: "fail", detail: tok.error };
  return { status: "ok" };
}

export type PlayPurchaseResult =
  | {
      ok: true;
      /** 0 = purchased, 1 = canceled, 2 = pending (Google's purchaseState). */
      purchaseState: number;
      /** 0 = yet to be consumed/acknowledged, 1 = consumed (consumptionState). */
      consumptionState: number;
      /** 0 = not acknowledged, 1 = acknowledged. */
      acknowledgementState: number;
      /** Google order id (e.g. GPA.xxxx) — stable, used for audit. */
      orderId: string | null;
    }
  | { ok: false; error: string; retriable: boolean };

/**
 * Verify a product purchase. `nowSec` is passed in (not read from Date) so the
 * caller controls the clock (and tests are deterministic).
 */
export async function verifyPlayPurchase(
  packageName: string,
  productId: string,
  purchaseToken: string,
  nowSec: number,
): Promise<PlayPurchaseResult> {
  const tok = await getAccessToken(nowSec);
  if ("error" in tok) return { ok: false, error: tok.error, retriable: true };

  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(packageName)}/purchases/products/` +
    `${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${tok.token}` } });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Play API request failed.", retriable: true };
  }
  if (res.status === 404 || res.status === 400) {
    // Unknown/invalid token or product — a genuine "not a valid purchase".
    return { ok: false, error: "Purchase token not found or invalid.", retriable: false };
  }
  if (!res.ok) {
    return { ok: false, error: `Play API returned ${res.status}.`, retriable: res.status >= 500 };
  }
  const json = (await res.json()) as {
    purchaseState?: number;
    consumptionState?: number;
    acknowledgementState?: number;
    orderId?: string;
  };
  return {
    ok: true,
    purchaseState: json.purchaseState ?? 0,
    consumptionState: json.consumptionState ?? 0,
    acknowledgementState: json.acknowledgementState ?? 0,
    orderId: json.orderId ?? null,
  };
}
