# Google Sign-In — fixing "No Google account / sign-in fails" on Android

## TL;DR — the code is fine; you need ONE console registration

The app already reuses the **web's** Google OAuth client ID (fetched from the
server's `/api/auth/providers` → `googleClientId`, backed by `GOOGLE_CLIENT_ID`).
No new client, no client secret, no mobile-specific key.

But Google requires an **Android OAuth client** in the Cloud Console that binds
your app's **package name + signing SHA-1**. This is the Android equivalent of
the web client's "authorized redirect URIs". Until it exists, Google's
Credential Manager refuses to return a credential and sign-in fails.

The web works because it uses a client secret + redirect URI; Android uses
package + SHA-1 instead. Same underlying OAuth client, different proof of origin.

---

## Do this once (≈3 minutes) in Google Cloud Console

Use the **same Google Cloud project** that owns the existing web OAuth client
(the one behind `GOOGLE_CLIENT_ID`). Do **not** create a new project or secret.

1. **APIs & Services → Credentials → + Create credentials → OAuth client ID**
2. **Application type: Android**
3. **Package name:** `com.filipinodama.app`
4. **SHA-1 certificate fingerprint:** add ALL THREE below (create the client with
   one, then add the others under the same client, or create one client and add
   fingerprints — Google allows multiple SHA-1s per Android client):

   | Purpose | SHA-1 |
   |---|---|
   | **Debug** (emulator / `./gradlew installDebug`) | `F7:0D:21:15:EB:C0:2E:AD:39:B4:33:D3:90:B5:8E:CA:F5:7B:DA:5B` |
   | **Upload key** (the `.aab` you sign & upload) | `C8:50:F7:84:16:73:EB:10:36:ED:B0:28:DA:64:92:5C:E6:5D:13:BF` |
   | **Play App Signing** (see step 5 — the one that matters for installed Play builds) | *(get from Play Console — instructions below)* |

5. **Play App Signing SHA-1 (REQUIRED for the published app):**
   Google Play re-signs your app with its own key, so the certificate users
   actually run is **not** your upload key. Get its SHA-1 here:
   - **Play Console → your app → Test and release → Setup → App signing**
   - Copy the **"App signing key certificate" SHA-1 fingerprint**
   - Add it to the Android OAuth client above.
   Without this, Google sign-in works in debug/internal but breaks for anyone
   who installs from Play.

6. **Save.** Changes can take a few minutes to propagate.

---

## Also required to TEST it

Google sign-in needs a Google account present on the device/emulator:
**Settings → Passwords & accounts → Add account → Google → sign in.**
An emulator image **with Google Play** (not "Google APIs" only) is easiest.

---

## Verifying

- Debug build on a device/emulator that has (a) a Google account added and
  (b) the debug SHA-1 registered → the Google picker should appear and return
  a credential.
- If you still get "No Google account is available": the account really isn't
  added on the device (that exact exception is `NoCredentialException`).
- If you get a different `GetCredentialException` even with an account present:
  the SHA-1 for that build variant isn't registered yet (most common:
  forgetting the **Play App Signing** SHA-1 for the published build).

## Why no code change

- `apps/server/src/auth/routes.ts:214` exposes `googleClientId` to mobile.
- `apps/server/src/config/env.ts:101` turns the feature on when
  `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are set (both are set).
- `GoogleSignInHelper.kt` fetches that id and calls Credential Manager with it.
  The failure is upstream of all this — Google won't mint a credential until the
  package+SHA-1 registration authorizes it.
