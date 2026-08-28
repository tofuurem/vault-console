# Vault Console 0.8.1 Corrective Hardening Implementation Plan

- Date: 2026-08-28
- Status: release verification complete; publication pending
- Branch: `main`
- Starting commit: `44895d1`
- Design: `docs/superpowers/specs/2026-08-28-vault-console-0.8.1-corrective-hardening-design.md`
- Delivery: one `0.8.1` release and one multi-architecture registry image

## Goal and boundaries

Correct the confirmed 0.8.0 daily-KV defects and harden the implementation,
verification, dependencies, and runtime without changing Access Center or adding
new Vault product scope. Vault remains authoritative for authorization. Existing
runtime variables, browser preferences, Vault data, and reverse-proxy paths stay
compatible and require no migration.

Every phase starts from a recorded base commit. Each task receives a narrow test
and an atomic commit. Task commits created after the phase base are squashed into
the intended phase commit only after the phase verification passes.

## Phase 1 — Authoritative permissions and conflict-safe saves

Phase base: the implementation-plan commit.

### Task 1.1 — Tri-state KV permission decisions

- Files: `src/application/vault/useKvActionPermissions.ts`,
  `src/application/vault/useKvExplorerData.ts`, Explorer view contracts and
  focused tests.
- Represent allowed, denied, and unavailable capability discovery explicitly.
  Preserve scoped read failures when discovery is unavailable and expose only a
  guarded attempt path; confirmed denial remains gated.
- Acceptance: write-only, readable metadata, and mount-config actions remain
  reachable when preflight is unavailable; no copy claims that access is
  granted; direct Vault `403` remains the final error.
- Verify: focused permission, explorer-data, Inspector, and ExplorerPage tests.

### Task 1.2 — Real-Vault capability fallback fixture

- Files: `scripts/test-compose-e2e.sh`, `e2e/vault-console.spec.ts`,
  `scripts/test-vault.sh`, and `src/integration/vault-community.test.ts`.
- Remove `sys/capabilities-self` from the no-default-policy write-only fixture
  and add authoritative fallback scenarios for write-only and unknown metadata
  or mount actions.
- Acceptance: a token with KV write but no preflight grant reaches the editor and
  writes successfully; a confirmed deny fixture stays gated.
- Verify: `npm run test:e2e` against one Vault version during the task.

### Task 1.3 — Fresh-snapshot save protocol

- Files: metadata/config normalization domain helper and tests,
  `SecretMetadataDrawer`, `KvMountConfigDrawer`, Explorer callbacks, component
  tests, and controlled browser coverage.
- Store the normalized load baseline, re-read on Save, compare structurally,
  block mutation on change, preserve the draft, and provide Load latest.
- Acceptance: unchanged resources save once; changed resources never mutate;
  draft and conflict alert remain until explicit reload or close.
- Verify: domain and drawer tests plus the focused metadata/config E2E cases.

Phase verification:

- `npm run quality`
- `npm run build`
- `VAULT_TEST_IMAGE=hashicorp/vault:1.21.3 npm run test:vault`
- `VAULT_TEST_IMAGE=hashicorp/vault:2.0.3 npm run test:vault`

Intended phase commit:
`fix: make KV authorization and document saves authoritative`.

## Phase 2 — Responsive and large-document editor safety

### Task 2.1 — Reflow-safe structured rows

- Files: `SecretMetadataDrawer`, `WriteOnlySecretDrawer`, component tests, and
  responsive browser tests.
- Use mobile-first minmax tracks with a 44 px action column, preserve logical
  focus order, and prevent long values from widening the drawer.
- Acceptance: both drawers have no horizontal overflow at 320, 360, 390, and
  430 px or the 400%-zoom layout equivalent.
- Verify: focused drawer tests and responsive Playwright cases.

### Task 2.2 — Deferred large JSON validation

- Files: a typed JSON validation worker/client or hook, `JsonSecretEditor`,
  `WriteOnlySecretDrawer`, `SecretWorkspace`, and focused tests.
- Debounce ordinary semantic parsing by 250 ms, ignore stale revisions, move
  documents over 512 KiB outside render-time parsing, and always validate the
  exact value before Format, Review, or Save.
- Acceptance: rapid edits do not publish stale results, large documents show a
  warning without leaking content, and invalid current input cannot save.
- Verify: focused JSON domain/editor/workspace/drawer tests and build worker
  output.

Phase verification: `npm run quality && npm run build && npm run test:e2e`.

Intended phase commit:
`fix: harden KV editors for responsive and large documents`.

## Phase 3 — Explorer and TypeScript quality boundaries

### Task 3.1 — Extract Explorer operation controllers

- Files: new typed hooks/controllers under `src/pages/explorer` or
  `src/application/vault`, `page.tsx`, existing Explorer tests.
- Extract selected-secret mutations, single destructive operations, shared bulk
  state, and metadata/config coordination without moving Vault calls into
  presentational components.
- Acceptance: behavior and query invalidation remain identical; `ExplorerPage`
  no longer owns duplicated state machines; Access Center is untouched.
- Verify: ExplorerPage, bulk-dialog, Inspector, and application-hook tests.

### Task 3.2 — Strict compiler and scoped complexity gate

- Files: `tsconfig.app.json`, `eslint.config.js`, package scripts, the few strict
  incompatibilities, and any directly affected tests.
- Enable TypeScript strict and unused checks. Add an Explorer-only lint gate with
  complexity 20 and 200 source lines per function, then refactor only remaining
  Explorer violations required for the gate.
- Acceptance: no per-file TypeScript weakening; intentional unused signature
  values use underscore conventions; Access Center is outside the new gate.
- Verify: `npm run type-check`, `npm run lint`, and `npm run lint:complexity`.

### Task 3.3 — Security-boundary coverage gate

- Files: Vitest coverage dependency/config, focused missing tests, package
  scripts.
- Collect coverage for KV/session application and domain boundaries at 80% lines,
  statements, and functions and 75% branches.
- Acceptance: thresholds pass from meaningful tests without excluding uncovered
  production branches merely to raise the number.
- Verify: `npm run test:coverage`.

Phase verification:
`npm run quality && npm run test:coverage && npm run build`.

Intended phase commit:
`refactor: enforce Explorer and TypeScript quality boundaries`.

## Phase 4 — Dependency, CI, and container hardening

### Task 4.1 — Dependency remediation and reviewed audit policy

- Files: `package.json`, `package-lock.json`, `SECURITY.md`, and an explicit audit
  check script if remaining development-only advisories require review.
- Upgrade React Router to 7.18.2 and apply compatible patch/minor dependency
  updates that remove advisories. Document any remaining advisory with scope,
  reachability, owner, and review date.
- Acceptance: production audit is clean; every remaining full-tree exception is
  reproducible and the check fails when the advisory set changes unexpectedly.
- Verify: `npm audit --omit=dev`, full `npm audit`, quality, and build.

### Task 4.2 — Reproducible CI matrix

- Files: `.github/workflows/ci.yml`, package/scripts documentation, Playwright
  artifact settings.
- Add deterministic quality, coverage, build, audit, Vault 1.21.3/2.0.3
  integration, and production-container Chromium E2E jobs. Keep tokens masked and
  upload traces/screenshots only on failure.
- Acceptance: workflow syntax is valid, commands match local scripts, matrix
  versions are explicit, and no deployment credentials are required.
- Verify: workflow static inspection plus every underlying command locally.

### Task 4.3 — Non-root read-only production image

- Files: `Dockerfile`, Nginx/runtime templates, entrypoint scripts, `compose.yml`,
  container smoke helpers, and deployment docs.
- Run Nginx as a named non-root user on 8080, generate runtime config and the
  optional Vault CA bundle in explicitly writable locations, set read-only/no-new-
  privileges/drop-capabilities Compose defaults, and retain health/proxy/SPA
  behavior.
- Acceptance: OCI `Config.User` is non-empty/non-root; container starts with a
  read-only root filesystem and minimal tmpfs; custom CA, `/healthz`, runtime
  config, assets, SPA routes, and `/v1/` proxy pass smoke tests.
- Verify: production image build, container smoke, and Compose E2E.

Phase verification:

- `npm run quality`
- `npm run test:coverage`
- `npm run build`
- `npm run test:vault` for both versions
- `npm run test:e2e` for both versions
- `.githooks/pre-push`

Intended phase commit:
`build: harden Vault Console verification and runtime`.

## Phase 5 — Documentation, version, and release artifacts

### Task 5.1 — Operator documentation and version

- Files: `README.md`, `USAGE.md`, `SECURITY.md`, policy examples, design/plan
  status, `package.json`, and `package-lock.json`.
- Document advisory capability fallback, conflict handling, large-document
  warning, CI support matrix, hardened container requirements, and rollback.
  Bump the application to 0.8.1.
- Acceptance: docs match tested endpoints and deployment behavior; Access Center
  remains explicitly unchanged.
- Verify: documentation search, version consistency, and `git diff --check`.

### Task 5.2 — Final release verification

- Run full quality, coverage, build, audits, both Vault integration versions,
  both production-container E2E versions, hook checks, container hardening smoke,
  and spec/plan/doc alignment review.
- Acceptance: all required commands pass with a clean worktree except for the
  intended release commit; no known finding in the approved design remains.

### Task 5.3 — Publish immutable artifacts

- Commit the 0.8.1 release, create and push annotated tag `v0.8.1`, build and push
  amd64/arm64 `vault-console:0.8.1`, verify registry manifest and health, and
  record the immutable digest in a main-only documentation commit.
- Acceptance: tag points to the release commit, registry exposes both target
  architectures, health passes, and the digest document matches the registry.

Intended release commit: `chore: prepare Vault Console 0.8.1`.

## Compatibility, rollout, and recovery

- There is no Vault data, policy, or browser-storage migration.
- Retaining `sys/capabilities-self` improves UI precision but is optional.
- Unknown capability fallback can expose a guarded attempt that Vault may deny;
  it never bypasses Vault authorization.
- Conflict checks reduce stale-editor loss but cannot make the read/update pair
  atomic because Vault exposes no CAS on these configuration endpoints.
- Existing deployments may continue using the current environment variables and
  Caddy routing.
- Rollback uses the immutable 0.8.0 image; no data rollback is required.
