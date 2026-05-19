# Contributing to Formellia

Thanks for taking the time. This page is the operating manual for the
repository: branch model, commit conventions, what CI enforces, how
releases happen. If you're new, start with
[docs/getting-started.md](docs/getting-started.md) for the local dev
loop and [docs/architecture.md](docs/architecture.md) for the map.

## Branch model — GitFlow

```
            release/0.x.y ──merge commit──┐
                  ▲                       ▼
  feature/* ─►  develop ─────────────►  main ──tag──► Release workflow
  fix/*         (default)               (protected)
  chore/*
```

- **`develop`** is the default branch. Every change starts as a
  branch off `develop` and merges back into it via a PR.
- **`main`** is **protected**. Direct pushes are blocked. PRs to
  `main` must originate from `release/*`, `hotfix/*`, or `develop`
  — enforced by `.github/workflows/main-pr-policy.yml`.
- **Release** = a short-lived `release/X.Y.Z` branch off `develop`,
  bumping the version, merged into `main` with a **merge commit**
  (not a squash) to preserve the GitFlow history. Then a tag pushed
  on `main` triggers the Release workflow (multi-arch GHCR image +
  SBOM + Trivy scan + GitHub Release).
- After a release, `develop` is fast-forwarded to `main` to absorb
  the merge commit and the tag — the `sync-develop` flow.

### Branch naming

| Prefix | Use |
|---|---|
| `feature/` | new feature or non-trivial improvement |
| `fix/` | bug fix |
| `chore/` | tooling, deps, refactor without behaviour change |
| `docs/` | documentation only |
| `ci/` | workflows, CI config |
| `release/` | release branch — bumps the version |
| `hotfix/` | urgent fix on top of `main`, bypassing develop |

## Commit messages — Conventional Commits

Enforced on every PR by the **Commit Lint** CI job (commitlint v21 +
`@commitlint/config-conventional`).

```
<type>(<scope>): <short subject under 100 chars>

- bullet 1: what & why (wrap at ~100 chars)
- bullet 2: another concern, e.g. side effects, follow-ups
- reference issues / PRs / files inline when relevant
```

Conventional types we use: `feat`, `fix`, `chore`, `docs`, `ci`,
`refactor`, `test`, `style`, `perf`, `build`, `revert`.

PR titles are commit-linted too. Squash-merging copies the PR title
into the commit, so the title must follow the convention.

Conventions you'll see in real commits:

- Subject line ≤ 100 chars, imperative ("scope editor field pickers"),
  no trailing period.
- Body bullets use `-`, lines wrapped under 100 cols.
- **No `Co-Authored-By: Claude`** in commits or PR bodies — explicit
  project preference.

## What CI enforces on every PR

| Check | Source | Notes |
|---|---|---|
| **Commit Lint** | `.github/workflows/ci.yml` | every commit in the PR range |
| **Unit Tests** | vitest | `npm test` — 160+ pure-function tests |
| **Typecheck & Build** | tsc + Next build (Turbopack) | full build |
| **Docker Build Smoke** | `docker build .` + boot the image | asserts `[::]:3000` listener (dual-stack) |
| **Dependency Review** | actions/dependency-review-action | rejects licences and known vulns |
| **npm Audit** | `npm audit --audit-level=high` | non-blocking but reported |
| **CodeQL (TypeScript)** | GitHub CodeQL | security-and-quality queryset |
| **Gitleaks** | gitleaks/gitleaks-action | scans the diff for secrets |
| **Enforce source branch** | `main-pr-policy.yml` | only release/hotfix/develop can target main |
| **Auto-merge Dependabot PR** | dependabot/fetch-metadata | patch/minor on develop, skips actions + majors |

## Local checks before opening a PR

```bash
npm install
npm run typecheck     # tsc --noEmit
npm test              # vitest run
npm run build         # next build (sanity)
```

Optional but encouraged for backend / API work:

```bash
npm run test:e2e      # boots a test Postgres + the app, hits the API
```

The two `BKSEC-04 / BKSEC-05` failures are documented rate-limit
flakes (the same suite saturates the budget by design) — anything
beyond those is a real regression.

## Tests — where to put what

- **Pure-function units**: `src/__tests__/<name>.test.ts`. Vitest
  picks them up automatically. Examples: `scopedFields.test.ts`,
  `mergeAdminConfig.test.ts`, `yamlSecretScanner.test.ts`. No
  component rendering — extract pure helpers into `src/lib/...`
  and test those.
- **API integration**: `tests/api/main.ts` is a single TS script
  that drives the running server through HTTP. New backend
  endpoints typically land with a new test case here.

## Releasing

The full sequence, mirroring the `release/0.2.x` cycles:

1. Sweep open Dependabot PRs on `develop` (low-risk first). The
   auto-merge workflow skips `github_actions` and majors; sweep
   those manually with `gh pr merge --squash`.
2. Branch `release/X.Y.Z` from `develop`.
3. `npm version X.Y.Z --no-git-tag-version`, commit
   `chore(release): X.Y.Z`.
4. PR `release/X.Y.Z → main`. CI must be green, including the
   `🚦 Enforce source branch` check.
5. Merge with the **"Create a merge commit"** strategy
   (`gh pr merge <n> --merge`).
6. Tag `X.Y.Z` on `main` and push — this triggers the Release
   workflow (build the multi-arch image, scan, sign, publish on
   GHCR, create the GitHub Release).
7. Run the `sync-develop` flow to fast-forward `develop` to the new
   `main` tip.

The Mesh Union deploy is upgraded by `podman compose pull && podman
compose up -d`; the image is `ghcr.io/altagen/formellia:<version>`.

## Code style

- TypeScript: strict mode. `any` only with a justification comment.
- React: server components by default in `app/`. Use the
  `"use client"` directive only when interaction or browser-only
  APIs are needed.
- Imports: `@/*` alias maps to `src/`. Group: external → `@/lib/...`
  → relative.
- File names: kebab-case for routes and assets, PascalCase for
  components. One default export per component file.
- No `console.*` in production paths — use the `Pino` logger
  (`startupLogger`, `schedulerLogger`, etc.). Dev-only warnings
  guarded with `if (process.env.NODE_ENV === "development")`.

## Documentation

When you change behaviour that's documented:

- **Code is the source of truth**, but the docs are the front door
  for the next operator. Refresh the relevant `docs/*.md` in the
  same PR when feasible.
- The YAML reference (`docs/yaml-schema.md`) tracks
  `src/types/config.ts` and `src/lib/yaml/configSchema.ts`; keep
  them aligned.
- `README.md` is the project pitch — don't bloat it. Detailed
  changes go under `docs/`.

## Reporting issues

- **Bugs**: a regular GitHub issue with reproduction steps and the
  observed vs. expected behaviour.
- **Security**: open a [private security advisory](https://github.com/Altagen/Formellia/security/advisories)
  rather than a public issue.
- **Feature requests**: a regular issue with the use case. Discuss
  before opening a large PR — small changes are easier to review.

## License

By contributing you agree that your contributions are licensed under
the same [Apache 2.0 license](./LICENSE) as the rest of the project.
