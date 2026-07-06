# GIT_WORKFLOW.md — Branch-per-Feature → Dev → Production

## Branch model

```
main   ──────●───────────────●───────────────●──────▶   PRODUCTION (auto-deploys)
              \             /  \             /
dev    ────────●──●──●──●──●────●──●──●──●──●──────────▶  STAGING/DEV (auto-deploys to dev env)
                \  \  \                 \
feat/* ──────────●  ●  ●   ...           ●   (short-lived, one per feature)
```

- **`main`** — production. Protected. Only updated by a reviewed merge from `dev` at a stable milestone. Pushing to `main` triggers the production deploy.
- **`dev`** — integration/staging. Protected. All feature branches merge here via PR. Auto-deploys to the dev environment for testing.
- **`feat/<name>`** — one branch per feature from `ROADMAP.md`. Short-lived. Branched off `dev`, merged back into `dev`.
- Support prefixes: `fix/<name>` (bug), `chore/<name>` (tooling), `hotfix/<name>` (branched off `main` for urgent prod fixes, merged to both `main` and `dev`).

## The rule (as requested)

> **Every feature is built in its own branch. It is tested in dev. Only when everything passes in dev testing is it merged; when a milestone is stable on dev, it is promoted to `main` for production.**

## Per-feature lifecycle

```bash
# 1. start from latest dev
git checkout dev && git pull
git checkout -b feat/game-engine

# 2. build + write tests, commit in logical chunks (conventional commits)
git commit -m "feat(engine): mandatory capture + maximal-chain generator"

# 3. keep up to date
git fetch origin && git rebase origin/dev

# 4. push and open PR INTO dev
git push -u origin feat/game-engine
#    open PR: base=dev, compare=feat/game-engine
```

**A PR into `dev` may merge only when:**
- CI is green: `lint`, `typecheck`, `test` (unit + affected e2e), `build` all pass.
- The feature's **acceptance criteria in `ROADMAP.md` are met**.
- For gameplay/economy PRs: the `packages/game-engine` test suite and any economy-ledger tests pass.
- At least one review approval (human, or the agent's self-review checklist for solo builds).
- No merge conflicts; branch is up to date with `dev`.

Merge strategy: **squash-merge** feature branches into `dev` (clean history). Delete the branch after merge.

## Promoting dev → production

When a milestone (a group of features from `ROADMAP.md`) is verified on the dev environment:

```bash
# open a release PR: base=main, compare=dev
# title: "release: milestone M2 — realtime match loop"
```
Merging that PR to `main`:
1. Runs full CI + full e2e suite against a production-like build.
2. Runs `prisma migrate deploy` against the production DB.
3. Deploys web + server.
4. Tag the release: `git tag vX.Y.0 && git push --tags`.

**Never commit directly to `main` or `dev`.** Never push production from a feature branch.

## Branch protection (configure on the remote)
- `main`: require PR, require CI pass, require ≥1 approval, require up-to-date, no force-push, linear history.
- `dev`: require PR, require CI pass, no force-push.

## CI (`.github/workflows/ci.yml`) — runs on every PR
```
jobs: install → lint → typecheck → unit test (vitest) → build → e2e (playwright, on dev-targeted PRs)
```
Cache pnpm + turbo. Spin up ephemeral Postgres + Redis service containers for integration tests. Fail the job if the game-engine suite or payment-webhook tests fail.

## Commit convention
Conventional Commits: `feat|fix|chore|refactor|test|docs(scope): summary`. Scope = feature folder (`engine`, `auth`, `store`, `rooms`, …). This keeps an auto-generatable changelog.

## Environments
| Branch | Environment | URL (example) | DB |
|--------|-------------|---------------|-----|
| `feat/*` | ephemeral preview (optional) | PR preview | throwaway |
| `dev` | **staging/dev** | dev.filipinodama.gg | dev Postgres/Redis |
| `main` | **production** | filipinodama.gg | prod Postgres/Redis |

## Secrets
No secrets in the repo. `.env.example` is committed; real values live in the CI/hosting secret store per environment. Stripe uses **test keys** on dev and **live keys** on production.
