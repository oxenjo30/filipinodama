# Local v60 reconciliation — 2026-09-08

## Decision

Keep the published v60 Android design from `1c2729b`. Stop the Fiesta Bay, living-rank-hall, Three/Rive and v61 audio review iterations. This local reconciliation includes current `origin/main` (`e4866e4`) and selected functional fixes extracted from the old local main (`3bc8f5d`). No remote push, release upload, production configuration change, or migration is part of this task.

## Recovery

- `codex/archive-main-before-v60-cleanup-20260908`: original local main.
- `codex/archive-mobile-before-v60-cleanup-20260908`: original primary checkout commit (`2111d29`).
- `codex/unity-pilak-squire-proof` and other design branches/worktrees are preserved.
- Tracked local edits: named stash `36717d65086b450b80cf9e34e923290469a8beb1` (`v60 cleanup 2026-09-08: preserve tracked redesign and local experiment edits`). A second copy is `.backups/v60-cleanup-20260908/tracked-edits.patch` (SHA256 `0AE328CEC06C685E3F1F450BC6C468D1D84989A09E7E927E52884ACF054C831C`).
- Existing untracked artwork, reference files and local tooling remain on disk. No blanket clean/delete was run.

## Retained fixes

- Session generation and refresh/logout barriers; session-scoped economy/profile responses and Play Billing callbacks.
- Matchmaking queue replacement and cleanup ownership, preserving v60 offline-aware join errors.
- Guild chat cancellation/generation gates; guest sign-in handoff and guild request ownership.
- Account-scoped store inventory and purchase state, including checkout batches that stop when the initiating session changes.
- Native auth text callback, deletion/caret and password-input handling.
- Resolved friend-request inbox filtering, unread reconciliation, and server dismissal.
- Home keeps confirmed data on refresh failure, reports failure through the existing snackbar, clears account-specific state, and ignores late responses from old sessions.
- Reactive auth reads in profile/navigation and removal of an unused constraints scope satisfy lint without changing layouts.
- Loading progress follows its context/duration and invokes the current completion callback; v60 art/audio remain.

## Excluded

Fiesta layout/components/tokens, replacement art, new rank environments and motion, replacement audio, new navigation/header styling, Three.js experiment dependencies, and redesign-specific policies/tests. Existing v60 routes and visual structures are the baseline. Redesigned Profile, Checkout, progression and other screen replacements remain archived; they are not imported wholesale.

## Verification

Server typecheck and 4 mocked Fastify route tests passed. Web typecheck/build passed (65 prerendered pages). Production-command localhost checks returned 200 for /, /learn, /play and /blog, with /rules returning 301 to /learn. Android full unit suite passed: 459 tests, zero failures/errors. `:app:assembleDebug` and `:app:lintDebug` passed. Existing non-fatal deprecation/resource warnings remain. The debug APK is in `.worktrees/v60-reconcile-20260908/apps/android/app/build/outputs/apk/debug/app-debug.apk`. Device smoke testing is unavailable: adb reports no attached devices, the default AVD directory is empty, and saved repository-local AVDs reference a missing SDK system image. No device/Play-purchase/audio-output or production database claim is made.