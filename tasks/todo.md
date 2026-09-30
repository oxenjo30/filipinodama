# Local v60 reconciliation — 2026-09-08

The owner has stopped mobile redesign work. Keep the published v60 design. Prior design plans and branches are archival references, not an active implementation queue.

- [x] Inspect branches, worktrees, dirty changes, release commit, and current origin/main
- [x] Preserve original main and mobile branch tips
- [x] Merge origin/main and the published v60 source in an isolated worktree
- [x] Extract non-design functional fixes while preserving v60 assets, theme and audio
- [x] Complete final Android, server and web verification and review
- [x] Preserve tracked edits and make the primary local checkout main
- [x] Record final evidence and recovery details

See docs/ops/v60-local-reconciliation-20260908.md. No push, production deployment or Play upload is requested.
# C-drive archive cleanup — 2026-09-08

- [x] Measure relevant C: usage and D: capacity; preserve v60 release and source recovery branches
- [x] Verify old scratch-worktree state and stop only identified idle build daemons
- [x] Copy/hash-verify C: Gradle home and old FilipinoDama temporary work to D:
- [x] Remove verified C: originals and retain compatible paths with junctions
- [x] Verify Git/build access, measure recovered space, and document archive paths

# Search visibility update — 2026-09-21

- [x] Audit live Search Console opportunities against the implemented web SEO surfaces
- [x] Confirm `/learn` remains the canonical rules pillar and the sitemap generator is already authoritative
- [x] Align `/learn` metadata, H1, and opening summary with the observed `dama rules` intent
- [x] Separate homepage discovery intent from `/play` transactional intent
- [x] Update the Dama-vs-Checkers search title to match the leading question query
- [x] Add contextual links for backwards-movement and Dama-vs-Chess demand without changing the approved layout
- [x] Run web typecheck, lint, build/prerender, and inspect generated metadata, links, redirects, and sitemap
- [x] Review the final diff for unrelated or visual changes

# Search visibility deployment — 2026-09-21

- [x] Fetch `origin` and verify local `main` has no remote-only commits or merge conflicts
- [ ] Commit only the scoped SEO and task-documentation changes
- [ ] Push local `main` to `origin/main` without force
- [ ] Confirm the remote branch resolves to the pushed commit and CI is green
- [ ] Smoke-test the deployed search metadata, canonicals, redirects, and sitemap

# Board capture feedback integration — 2026-09-30

- [x] Inspect the source combo effect, shared board lifecycle, dirty state, and project lessons
- [x] Integrate Robin's engine-derived board guidance and route selection changes
- [x] Add capture particles, board shake, and NICE TAKE / nX COMBO feedback to playable boards
- [x] Suppress motion for reduced-motion users while retaining the readable capture banner
- [x] Run engine tests plus web typecheck, lint, and build
- [x] Review the scoped diff and start the local web preview for user testing

# Board feedback production release — 2026-09-30

- [x] Confirm visual acceptance and production authorization
- [x] Verify the approved 11-file scope and clean diff formatting
- [x] Fetch origin and confirm `origin/main` matches local `main`
- [x] Commit only the approved board feedback files
- [ ] Push `main` to `origin/main` without force
- [ ] Verify the remote commit and GitHub checks
