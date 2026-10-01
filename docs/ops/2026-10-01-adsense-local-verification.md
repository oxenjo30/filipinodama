# Local AdSense readiness verification — 2026-10-01

## Review locally

- Branch: `codex/adsense-readiness`, baseline `95ea499`.
- Worktree: `C:\Users\johnr\.codex\worktrees\adsense-readiness\FilipinoDama`.
- Web preview: http://127.0.0.1:4188 (production build served locally).
- Debug APK: `apps/android/app/build/outputs/apk/debug/app-debug.apk`.
- Main checkout and production were not changed by this implementation. Changes remain uncommitted for local review.

## Changes

- Removed unconditional Google Analytics and Meta Pixel from the web shell. Optional GA now requires a fresh explicit choice; legacy choices do not grant permission. Cookie settings supports withdrawal, including failed storage writes. Meta Pixel is removed.
- Public page tracking strips query/hash and excludes private or parameterized routes. Advertising consent remains denied. Mobile consent buttons wrap within their panel.
- Aligned web and Android privacy wording with implemented tracking and purchase handling; removed unsupported compliance claims.
- Replaced unsupported player, match, country and win statistics with supported product capabilities.
- Corrected backward capture, maximum capture, promotion, flying king and sideways-movement contradictions. Added two engine-verified worked examples. Replaced stripped empty diagram containers with their existing readable position descriptions; qualified unsupported history and benefit claims.
- Article links to unpublished or unknown destinations remain plain text after hydration. Added publisher identification and a correction contact route. Publication eligibility uses the same Manila calendar in browser and build.

## Evidence

- Shared/game-engine builds and 151 engine tests passed.
- Web typecheck passed; lint: 0 errors, 9 existing warnings.
- Consent regression suite passed, including deny by default, legacy consent, opt-in, SPA page views, withdrawal, blocked storage, regrant and private URL exclusions.
- Final web build passed: 75 prerendered pages, including 67 published articles. Existing large bundle warning remains.
- Android debug build and 459 unit tests passed (0 failures, 0 skipped).
- Isolated Chromium browser: 17 consent/content/mobile checks passed. Additional sweep: all 67 published articles returned 200, no invalid or legacy article-body links, no uncaught frontend errors. Final 390px mobile check verified both button bounds after clearing the agent preview cache.
- Browser fixture excluded game API calls and replaced GA SDK responses with an empty script. This verifies local consent control flow, not real GA telemetry, authenticated gameplay or account settings. Expected fixture network errors occurred.
- No connected Android device or configured emulator was available; native UI runtime remains for user verification with the debug APK.
- Screenshots and QA scripts: `C:\Users\johnr\.codex\visualizations\2026\10\01\01a0f62c-3fef-7380-8600-e19c457a160f`.

## Before production or AdSense resubmission

1. Review the accompanying `2026-10-01-adsense-editorial-checklist.md`. Targeted corrections cover 145 entries; this is not a complete independent source or tactical review. Check originality, supported historical/foreign-variant statements and substantial helpful examples. Google does not promise approval from a fixed article or word count.
2. Verify/disable GA Enhanced Measurement automatic page/history events in the account. `send_page_view:false` alone does not suppress Enhanced Measurement. Account settings and real SDK behavior were not verified.
3. Configure actual AdSense publisher details and approved consent messaging/CMP where applicable before serving ads. No placeholder publisher IDs, ads.txt or approval claims were added. Native app advertising requires its own AdMob/SDK, consent and app-ads.txt setup; the current native app has no ad SDK.
4. Test the local web experience and debug APK. Request Google review only after the reviewed fixes are deployed and account requirements are satisfied. Nothing was deployed or resubmitted here.

Official references:
- https://support.google.com/adsense/answer/48182
- https://support.google.com/adsense/answer/13554116
- https://support.google.com/publisherpolicies/answer/11112688
- https://developers.google.com/analytics/devguides/collection/ga4/views?hl=en
- https://support.google.com/admob/answer/6128543
