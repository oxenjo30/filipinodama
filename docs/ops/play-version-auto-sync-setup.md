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
3. Give it access to the **FilipinoDama** app. It needs **release** access, not
   just view access — see the warning below.
4. Send/confirm the invite.

> **⚠️ Read-only is NOT enough — this is corrected guidance.**
>
> An earlier version of this doc said **"View app information and download bulk
> reports (read-only)"** was sufficient, reasoning that the server only ever
> *reads* the track. That is wrong in practice.
>
> Reading a track through the Play Developer API requires opening an **edit**
> first (`POST .../edits`), and creating an edit is a **write-scoped** call. A
> read-only service account is refused at that very first step — **before any
> track is read** — so the sync 403s and never reaches your releases.
>
> Grant the service account permission to **view and manage releases** on the
> app (Play Console's release-management permission group). The server still
> never commits an edit: it opens one, reads, and abandons it.
>
> Symptom of getting this wrong: `ANDROID_LATEST_VERSION` silently never
> updates. Before the diagnostics fix below, the log line for this case wrongly
> read *"no completed production release found"* — which sent you to check your
> release instead of your permissions.

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
After configuring, check the server logs. Each failure now names the step that
failed, so you can tell them apart:

- `ANDROID_LATEST_VERSION <old> -> <new>` — it worked.
- `Play refused to open an edit (HTTP 403) …` — **permissions**. The service
  account cannot create an edit; grant it release access (see the warning in
  step 2). This is the case that used to masquerade as "no completed production
  release found".
- `production has no COMPLETED release yet; versionCode(s) N are still rolling
  out` — a **staged rollout**. Bump it to 100% and the next tick picks it up.
  Deliberate: we never nudge players toward a build they cannot download.
- `could not read the production track (HTTP …)` — the edit opened but the track
  read failed.
- `no completed production release found` — genuinely nothing published to
  production yet.
- `could not obtain access token` — the key itself is wrong; re-check step 1.
- **No `[play-version-sync]` lines at all** — `PLAY_SERVICE_ACCOUNT_JSON` is not
  set, so the sync never started.

Remember it runs on boot and every 6 hours, so allow for lag after publishing.
