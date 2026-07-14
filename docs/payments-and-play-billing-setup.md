# Payments & Play Billing — Owner Setup Guide

This is everything **you** enter to activate real-money features. Nothing here is
hardcoded or in env files — it's all configured in the **Admin console →
Settings** (SUPERADMIN role required). Secrets are encrypted at rest and never
displayed again after you save them.

---

## 1. PayMongo (web real-money top-up)

You can now enter/update PayMongo keys directly in the admin panel (previously
they were environment-only and read-only).

**Admin → Settings → Payment gateways → PayMongo credentials:**
1. **Secret key** — your PayMongo `sk_live_…` (or `sk_test_…` for sandbox). Paste, Save.
2. **Webhook secret** — the signing secret from your PayMongo webhook. Paste, Save.
3. **Public key** — your PayMongo `pk_live_…` (optional; used client-side). Paste, Save.
4. Use **Test connection** to confirm the secret key authenticates against PayMongo.
5. Each field shows its **source** ("Set in admin" vs "From env") and a masked preview.
   A key entered in admin overrides the env var; **Clear** reverts to the env fallback.

**Notes**
- Test vs Live PayMongo webhooks are SEPARATE — a mode mismatch silently drops
  every credit. Use the Live webhook secret when going live.
- Real-money diamond top-up on web is still gated by the `DIAMOND_TOPUP_ENABLED`
  master flag (Settings → Config). Keys can be entered before flipping it on.

---

## 2. Google Play Billing (Android real-money diamond top-up)

Android **must** use Google Play Billing for real-money purchases (Play policy —
external checkout like PayMongo is not allowed on Android). You configure it
entirely in the admin panel.

### One-time Play Console setup (done in the Google Play Console)
1. **Register the app** in Play Console with package name `com.filipinodama.app`.
2. **Create the 5 in-app products** (Consumable / "Managed products"), one per
   diamond pack. Pick any product IDs you like — you'll map them in admin. E.g.:
   | Pack | Diamonds (+bonus) | Suggested product ID |
   |------|-------------------|----------------------|
   | Pouch | 80 | `com.filipinodama.diamonds.pouch` |
   | Sack | 250 (+20) | `com.filipinodama.diamonds.sack` |
   | Chest | 550 (+70) | `com.filipinodama.diamonds.chest` |
   | Vault | 1200 (+200) | `com.filipinodama.diamonds.vault` |
   | Hoard | 2600 (+600) | `com.filipinodama.diamonds.hoard` |
   Set each product's price in the Play Console (the app displays Play's own
   formatted price — we never hardcode prices).
3. **Create a service account** with **Google Play Developer API** access:
   - In Google Cloud Console, create a service account, download its **JSON key**.
   - In Play Console → Users & permissions, grant that service account access to
     view financial data / manage orders (enough to call
     `purchases.products.get`).
4. **App signing SHA-1** — register the app's signing certificate SHA-1 in the
   Google Cloud OAuth setup (this is the same SHA-1 already needed for Google
   Sign-In: `F7:0D:21:15:EB:C0:2E:AD:39:B4:33:D3:90:B5:8E:CA:F5:7B:DA:5B` for the
   current debug key; use the release key's SHA-1 for production).

### Admin panel setup (Admin → Settings → Payment gateways → Google Play Billing)
1. **Package name** — `com.filipinodama.app` (pre-filled). Save.
2. **Service-account JSON** — paste the entire downloaded JSON key. Save.
   It's encrypted at rest; only the account's `client_email` is shown afterward.
   Use **Test connection** to confirm it authenticates with Google.
3. **Diamond pack → Play product ID** — for each pack, enter the product ID you
   created in step 2 above. Save mapping.
4. **Enable** — flip the Google Play Billing toggle on.

Once enabled + configured, the Android app's Wallet shows a "Buy diamonds"
section with real Play prices; a purchase is verified server-side against
Google and diamonds are credited exactly once.

---

## How crediting works (for your confidence)

- The Android app never credits diamonds itself. It launches Play's purchase
  flow, then sends the purchase token to the server.
- The server verifies the token with Google's Play Developer API, and only then
  credits diamonds — once per token (idempotent; a retry credits nothing extra).
- The purchase is consumed with Play only after the server confirms the credit,
  so a failed verification never loses a purchase.
- Everything is off by default. Nothing charges anyone until you enter the
  credentials and flip the enable toggles.
