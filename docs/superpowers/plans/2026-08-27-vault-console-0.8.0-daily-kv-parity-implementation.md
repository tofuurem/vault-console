# Vault Console 0.8.0 Daily KV v2 Parity Implementation Plan

- Date: 2026-08-27
- Status: implementation complete; release verification pending
- Branch: `main`
- Starting commit: `cfa9ce6d927512955588c72a3fbac858e0470c55`
- Design: `docs/superpowers/specs/2026-08-27-vault-console-0.8.0-daily-kv-parity-design.md`
- Delivery: one `0.8.0` release and one multi-architecture registry image

## Goal and boundaries

Deliver the approved daily KV v2 and current-session parity release: permanent
key deletion, correct version operations, exact-path and write-only access,
editable key metadata and mount defaults, token copy/renew/revoke, and removal
of table density. Access Center and all non-KV engines remain unchanged.

Compatibility is intentionally additive at the Vault API boundary. Existing
secret values, metadata, favorites, recents, and theme preferences require no
data migration. The only browser migration removes both obsolete Vault Console
density records without touching native Vault `vault-*` storage.

## Phase 1 — Typed API and permission foundations

Phase base: the plan commit created before implementation.

### Task 1.1 — KV domain models and CAS strategies

- Files: `src/domain/vault/contracts.ts`, focused domain validation modules and
  unit tests.
- Add rich key metadata, mount configuration, metadata update input, and typed
  known-version/create-only/no-CAS write strategies.
- Acceptance: invalid CAS, duration, and metadata values are rejected before a
  request; callers cannot confuse CAS `0` with omitted CAS.
- Verify: `npm run test:run -- src/domain/vault` and `npm run type-check`.

### Task 1.2 — Exact KV adapter endpoint mapping

- Files: `src/infrastructure/vault/kv-v2/vault-kv-v2-adapter.ts`,
  `src/infrastructure/vault/kv-v2/vault-http-kv-v2.test.ts`.
- Add latest delete, rich metadata read/update, mount config read/update, and
  typed write payloads while retaining explicit version operations.
- Acceptance: every operation uses the endpoint, method, capability path, and
  request body in the design table; response parsing is strict.
- Verify: `npm run test:run -- src/infrastructure/vault/kv-v2/vault-http-kv-v2.test.ts`.

### Task 1.3 — Exact capability decisions and queries

- Files: `src/application/vault/useKvActionPermissions.ts`, query keys and
  focused tests.
- Split create/update, latest delete, explicit delete, metadata update/delete,
  and mount configuration decisions; preserve unavailable-discovery fallback.
- Acceptance: known denial gates only the corresponding operation and data and
  metadata reads remain independent.
- Verify: `npm run test:run -- src/application/vault/useKvActionPermissions.test.ts src/application/vault/useKvExplorerData.test.tsx`.

### Task 1.4 — Revoke-self session lifecycle

- Files: auth contracts/adapter tests, `VaultSessionContext`,
  `VaultSessionProvider`, provider tests.
- Add serialized revoke state and one cleanup action that clears the tab
  session, navigation session data, capabilities, and in-memory session state.
- Acceptance: success becomes anonymous, ordinary failure keeps the session,
  invalid-token failure uses expiry cleanup, and concurrent calls share one
  request.
- Verify: `npm run test:run -- src/infrastructure/vault/auth/vault-http-auth.test.ts src/application/vault/VaultSessionProvider.test.tsx`.

Phase verification: `npm run quality && npm run build`.

Intended phase commit: `feat: add Vault KV and session operation foundations`.

## Phase 2 — Destructive and least-privilege KV workflows

### Task 2.1 — Correct version actions and single permanent delete

- Files: Explorer coordinator, Inspector, SecretTable, confirmation component,
  permission tests and component tests.
- Use `DELETE data` for latest delete, keep explicit version delete separate,
  permit destroy for soft-deleted non-destroyed versions, and expose typed-path
  permanent key deletion from the row and Inspector without metadata-read
  coupling.
- Acceptance: labels never confuse a version with a key; successful metadata
  delete closes stale selection and invalidates all relevant queries.
- Verify: focused Inspector, SecretTable, ExplorerPage, and confirmation tests.

### Task 2.2 — Bulk permanent key deletion

- Files: new bulk application service and tests, bulk toolbar/dialog and tests,
  Explorer orchestration.
- Implement bounded-concurrency preflight/execution and per-key
  succeeded/denied/missing/failed outcomes with `DELETE <N> KEYS` confirmation.
- Acceptance: folders are never targets, partial outcomes remain visible, and
  successful paths leave selection, favorites, recents, and stale queries.
- Verify: new bulk service/dialog tests plus ExplorerPage tests.

### Task 2.3 — Exact-path navigation

- Files: focused path-normalization domain module/tests, Explorer header/error
  form and route tests.
- Add `Open exact path` independently of directory LIST and validate logical
  paths without treating them as API fragments.
- Acceptance: a selected exact path can load while the directory query remains
  denied; invalid paths never navigate.
- Verify: path normalization, ExplorerMain, ExplorerPage, and route tests.

### Task 2.4 — Explicit write-only editor

- Files: new write-only drawer and tests, Explorer/Inspector orchestration,
  gateway call sites.
- Reuse structured/JSON editing, show full-replacement warning, and support
  known-version CAS, create-only CAS `0`, and acknowledged no-CAS replacement.
- Acceptance: unreadable data is never represented as an empty current secret;
  editor input survives errors and no-CAS requires acknowledgement.
- Verify: write-only drawer, ExplorerPage, and adapter tests.

Phase verification: `npm run quality && npm run build`.

Intended phase commit: `feat: add safe KV deletion and least-privilege workflows`.

## Phase 3 — Metadata, mount, and session UI completion

### Task 3.1 — Key metadata view and editor

- Files: Inspector, new metadata editor/validation modules and tests, Explorer
  mutations and invalidation.
- Display all supported readable fields and provide fresh-read full updates for
  users with metadata read+update.
- Acceptance: unique non-empty custom keys, non-negative maximum versions, and
  valid Vault duration; blind replacement is impossible.
- Verify: metadata validation/editor, Inspector, ExplorerPage, and adapter tests.

### Task 3.2 — KV mount configuration drawer

- Files: new mount configuration drawer/tests, Explorer header/coordinator,
  query hooks/keys.
- Read and safely update maximum versions, CAS requirement, and delete-after
  default on `<mount>/config`.
- Acceptance: read and update capability are both required; mount deletion and
  unrelated tune settings are absent.
- Verify: mount config drawer/query/Explorer tests.

### Task 3.3 — Current-session profile actions

- Files: `TopBar`, new revoke confirmation, authenticated shell and tests.
- Add copy token, renew, revoke, local sign-out, server/auth/TTL summary, and
  query-cache cleanup after successful revoke.
- Acceptance: the raw token exists only inside the clipboard call and never in
  markup, toast, diagnostics, or errors; revoke and sign-out stay distinct.
- Verify: TopBar, revoke dialog, shell, and session provider tests.

### Task 3.4 — Remove table density and obsolete storage

- Files: preference provider/context/domain removal, app shell, Explorer table,
  command palette/E2E expectations, storage migration and tests.
- Make Comfortable the single table spacing, remove commands and controls, and
  delete both old density keys during startup migration.
- Acceptance: System/Light/Dark remain; Inspector/favorites/recents persistence
  remains; native Vault storage is untouched.
- Verify: preference/storage, TopBar, shell, SecretTable, and command tests.

Phase verification: `npm run quality && npm run build`.

Intended phase commit: `feat: complete KV metadata and session management UI`.

## Phase 4 — Integration, documentation, and release

### Task 4.1 — Real Vault and browser regression coverage

- Files: integration tests, `e2e/vault-console.spec.ts`, Vault harness scripts
  and policy fixtures.
- Cover endpoint semantics, permanent single/bulk delete, soft-deleted destroy,
  metadata/config round trips, exact path, write-only strategies, revoke-self,
  and absence of density UI.
- Acceptance: disposable Vault Community tests pass for supported harness
  versions; existing Explorer, Access Center, responsive, and storage
  compatibility scenarios remain green.
- Verify: `npm run test:vault` and `npm run test:e2e`.

### Task 4.2 — Product and operator documentation

- Files: `README.md`, `USAGE.md`, `SECURITY.md`, policy examples, design and
  plan status.
- Document destructive semantics, policies, session revocation, write-only CAS,
  metadata/config, upgrade storage cleanup, and rollback/rollout notes.
- Acceptance: examples match exact Vault endpoint capabilities and Access
  Center is explicitly unchanged.
- Verify: documentation search/checks, `git diff --check`, policy formatting.

### Task 4.3 — Version and release artifacts

- Files: `package.json`, `package-lock.json`, runtime/release documentation.
- Bump to `0.8.0`, run all local gates, build multi-architecture image, push
  `main` and annotated tag, publish registry image, verify manifest and health,
  then record immutable digest after the tag.
- Acceptance: tag points to the release commit; registry reports amd64+arm64;
  published `/healthz` succeeds; digest documentation commit is on `main` only.
- Verify: `npm run quality`, `npm run build`, `npm run test:vault`,
  `npm run test:e2e`, `.githooks/pre-push`, container smoke, remote manifest.

Phase verification: every command above plus final spec/plan/doc alignment
review and a clean worktree.

Intended release commit: `chore: prepare Vault Console 0.8.0`.

## Rollout and recovery

- API and policy additions are backwards-compatible; actions appear only when
  capabilities or authoritative Vault responses allow them.
- Metadata and mount updates always start from a fresh read, avoiding accidental
  reset of unknown current settings.
- No-CAS write-only replacement is explicit and double-confirmed.
- Permanent deletion and revoke-self have typed destructive confirmations and
  cannot be undone by Vault Console.
- Operators can roll back the container to `0.7.1`; Vault data needs no schema
  rollback. The removed density preference is intentionally not restored.
