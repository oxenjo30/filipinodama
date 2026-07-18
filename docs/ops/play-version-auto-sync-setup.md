# Auto-syncing the "update available" version from Google Play

The server can automatically keep `ANDROID_LATEST_VERSION` (the config the in-app
"update available" nudge compares against) in step with the **actual production
track on Google Play** — so you never set it by hand, and it never nudges players
toward a build that isn't live yet.

It's **disabled until you configure a service account**. Until then, nothing
changes (the value stays whatever it is). Once configured, the server reads the
live production versionCode on boot and every 6 hours and updates the config.

## One-time setup (Google Cloud + Play Console)

You do steps 1–3 (console work); the server code is already in place.

### 1. Create a service account (Google Cloud Console)
1. Go to <https://console.cloud.google.com> → pick or create a project.
2. **APIs & Services → Library** → enable **"Google Play Android Developer API"**.
3. **APIs & Services → Credentials → Create credentials → Service account**.
   - Name it e.g. `play-version-reader`. No roles needed here. Create.
4. Open the service account → **Keys → Add key → Create new key → JSON**.
   - A `.json` file downloads. Keep it safe — it's a secret.

### 2. Grant it access in Play Console
1. Go to <https://play.google.com/console> → **Users and permissions** (account
   level, the left rail near the bottom).
2. **Invite new users** → paste the service account's email
   (`play-version-reader@<project>.iam.gserviceaccount.com`, it's in the JSON as
   `client_email`).
3. Give it access to the **FilipinoDama** app with at least **"View app
   information and download bulk reports (read-only)"** on the app. (Read-only is
   enough — the server never writes to Play.)
4. Send/confirm the invite.

### 3. Add the key to Railway (server env)
1. Open the JSON key file and copy its **entire contents**.
2. In Railway → the **filipinodama** (API) service → **Variables** → add:
   - `PLAY_SERVICE_ACCOUNT_JSON` = *(paste the whole JSON, as one value)*
   - `PLAY_PACKAGE_NAME` = `com.filipinodama.app` (only if it ever differs from
     the default; otherwise you can skip it).
3. Redeploy the service (Railway does this automatically on a variable change).

## That's it

On the next boot the server will:
- read the highest **completed** versionCode on the **production** track, and
- set `ANDROID_LATEST_VERSION` to it (only when it changed).

From then on, publishing a new version to Play automatically enables the update
nudge for players on older builds — no admin step, and never toward an
unreleased build (it only reads *completed* production releases).

You can still override the value manually in the admin console; the next sync
will bring it back in line with Play.

## Verifying it works
After configuring, check the server logs for one of:
- `[play-version-sync] ANDROID_LATEST_VERSION <old> -> <new>` (it updated), or
- `[play-version-sync] no completed production release found` (nothing live yet —
  fine before your first production release), or
- `[play-version-sync] could not obtain access token` (the key or Play-Console
  access isn't right — re-check steps 1–2).
