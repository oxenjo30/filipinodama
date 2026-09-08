# C-drive project archive — 2026-09-08

Goal: reclaim C: space while preserving the reconciled v60 checkout and its recovery material.

## Scope

- Relocate C:/Users/johnr/.gradle to D:/BuildCaches/Gradle, retaining the original path as a junction. This is active shared build storage, not a disposable backup.
- Archive C:/Users/johnr/AppData/Local/Temp/claude/D--AI-Projects-FilipinoDama under .backups/c-drive-cleanup-20260908/claude-project-temp, retaining a compatible junction at the original path.
- Keep the SDK, current source, v60 release bundle, branches, stash and on-D: design worktrees intact. Removing D: material would not reclaim C: space.

## Safety and verification

The script uses exact approved paths, rejects nested reparse points, checks active processes, copies without /MOVE or /MIR, compares every file path/size/SHA256 and directory count, repeats integrity checks before removing C: originals, then verifies junction targets and representative reads. Full manifests and copy logs are in .backups/c-drive-cleanup-20260908/.

The old C: scratch checkout already had 1,075 deleted tracked paths and only residual generated build files, at commit 66e5fa8 (v22). Its pre-move Git status was recorded; this archive does not recreate missing historical source files.

## Result

Completed: 50,710 files / 2.778 GiB logical data relocated and verified. Both C: source directories are now junctions to the D: destinations; no duplicate C: payload remains.

Measured C: free space increased from 30.988 GiB to 33.283 GiB: a net gain of 2.296 GiB. Logical file size and observed disk-space gain are reported separately.

- Gradle: 14,528 files / 2.104 GiB; `gradlew --offline help --no-daemon` succeeded from the primary Android checkout.
- Old temporary work: 36,182 files / 0.674 GiB. The archived scratch worktree has exactly the same 1,077 status entries as before the move.
- Enabled `core.longpaths=true` in this repository's local Git configuration because the archive path exposed a Windows path-length limit. Normal Git access then passed without the path-length warning.
- v60 AAB SHA256 remains `AADAE4FCCA209CDAAD63C9CD5D0665BF55F4917B496215B8C3F840C530A736C4`; recovery stash `36717d65086b450b80cf9e34e923290469a8beb1` is unchanged.
- No application source, SDK, package lockfile, release bundle, recovery branch, or stash was deleted or modified. Only idle build daemons from the completed build were stopped; personal browsers were not controlled.

Evidence: `.backups/c-drive-cleanup-20260908/before.json`, `after.json`, both `relocation-manifest-*.json` files, and `robocopy-*.log`. Keep `D:/BuildCaches/Gradle` while its original-path junction is in use; it is live build storage.