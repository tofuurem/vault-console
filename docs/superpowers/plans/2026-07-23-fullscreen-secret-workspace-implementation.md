# Fullscreen Secret Workspace Implementation Plan

Date: 2026-07-23
Design: `docs/superpowers/specs/2026-07-23-fullscreen-secret-workspace-design.md`
Starting branch: `main`
Starting design commit: `0eab5ed`
Hooks: tracked `.githooks/pre-commit` and `.githooks/pre-push`, activated through `core.hooksPath`

## Goal

Add a full-viewport, secure workspace for reading and editing large or deeply
nested KV v2 secrets without losing JSON structure, while retaining the compact
inspector for quick inspection and version operations.

## User-visible outcome

- The inspector clearly identifies nested containers and opens any secret in a
  full-screen view.
- Nested objects and arrays can be browsed as a collapsible tree or formatted
  redacted JSON.
- Edit opens a full-height JSON editor with formatting, validation, cursor
  position, dirty-close protection, and CAS-protected save.
- Selecting a KV mount from Access control returns to the selected mount.
- The repository is scanned for committed and uncommitted secret material
  before the final GitHub push.

## Non-goals and compatibility

- No Vault endpoint, storage representation, Compose variable, or ACL model
  changes.
- No editor framework or new runtime dependency is introduced.
- Existing flat-secret creation remains in its current drawer.
- Existing versions, comparison, restore, and destructive actions remain in the
  compact inspector.
- Existing KV v2 data is used directly; no migration is required.

## Phase 1: Nested JSON workspace foundation

Phase base: `0eab5ed`

### Task 1.1: Add JSON domain helpers and the accessible workspace

Expected files:

- `src/domain/vault/secret-json.ts`
- `src/domain/vault/secret-json.test.ts`
- `src/pages/explorer/components/SecretDataTree.tsx`
- `src/pages/explorer/components/JsonSecretEditor.tsx`
- `src/pages/explorer/components/SecretWorkspace.tsx`
- focused component tests beside the new components

Acceptance criteria:

- Parsing accepts a JSON object root and rejects malformed or non-object roots.
- Redaction recursively preserves keys, container shape, array size, and JSON
  type without mutating source data.
- The tree recursively expands/collapses objects and arrays and masks primitive
  values by default.
- Read tabs implement accessible semantics and keyboard navigation.
- The editor fills available space, formats valid JSON, reports line/column
  syntax errors, reports cursor position, and inserts spaces on Tab.
- Dirty close requests explicit discard confirmation and saving is disabled
  while invalid or in flight.
- No secret value is logged, persisted, or included in an error message.

Narrow verification:

```sh
npm run test:run -- secret-json SecretDataTree JsonSecretEditor SecretWorkspace
npm run type-check
```

Phase-level verification:

```sh
npm run quality
npm run build
git diff --check
```

Intended phase commit:

```text
feat: add fullscreen nested secret workspace
```

## Phase 2: Explorer integration and regression coverage

### Task 2.1: Route inspector read/edit actions through the workspace

Expected files:

- `src/pages/explorer/page.tsx`
- `src/pages/explorer/components/ExplorerMain.tsx`
- `src/pages/explorer/components/Inspector.tsx`
- remove `src/pages/explorer/components/EditSecretDrawer.tsx` if no longer used
- `src/pages/explorer/ExplorerPage.test.tsx`
- affected focused component tests

Acceptance criteria:

- `Open full screen` launches read mode for the selected secret.
- `Edit secret` launches the same workspace directly in edit mode.
- Nested inspector rows show container type and item count rather than a masked
  string whose length depends on serialized JSON.
- A nested edit reaches `writeSecret` unchanged with the exact loaded version as
  the CAS value.
- Successful save refreshes details/history and leaves a clear success state.
- Capability-denied users can read but cannot enter edit mode.
- Users-to-KV navigation regression remains protected.

Narrow verification:

```sh
npm run test:run -- ExplorerPage Inspector SecretWorkspace AccessControlPage
npm run type-check
```

Phase-level verification:

```sh
npm run quality
npm run build
git diff --check
```

Intended phase commit:

```text
feat: integrate fullscreen secret workflow
```

## Phase 3: Visual verification, repository hygiene, and publication

### Task 3.1: Verify responsive and accessible behavior

Expected files:

- UI files from Phases 1 and 2 when verification exposes an issue
- `e2e/vault-console.spec.ts` when durable browser coverage is required

Acceptance criteria:

- Wide and narrow viewports show no clipped controls or overlapping content.
- Keyboard focus enters, remains within, and returns from the workspace.
- Escape, tabs, format, reveal, copy, edit, discard, and save are operable.
- Values start masked after every workspace opening.
- Production Compose works against disposable real Vault.

Verification:

```sh
npm run test:e2e
npm run test:vault
```

### Task 3.2: Scan Git and publish the clean result

Expected files:

- `.gitignore`, `.dockerignore`, or documentation only if the scan identifies a
  hygiene gap
- no secret-bearing fixture or environment file

Acceptance criteria:

- Tracked, untracked, ignored, staged, and historical filenames are checked for
  environment files, private keys, credential exports, tokens, and passwords.
- Content scanning emits only filenames and rule identifiers, never matched
  secret values.
- A dedicated secret scanner checks the working tree and Git history when
  available.
- Any confirmed secret blocks publication; history rewriting requires separate
  explicit approval.
- Full quality, build, real-Vault, and Compose checks pass.
- The clean `main` branch is pushed to `origin` only after all checks pass.

Final verification:

```sh
npm run quality
npm run build
npm run test:vault
npm run test:e2e
VAULT_UPSTREAM=http://vault:8200 docker compose config --quiet
git diff --check
git status --short
```

Intended stabilization commit, only if verification changes are needed:

```text
fix: stabilize fullscreen secret workflow
```

## Rollout and residual risk

- The published registry image remains unchanged until a separate image release
  is requested; this task publishes source to GitHub only.
- Large JSON documents are edited in a native text area rather than a syntax
  highlighting IDE. This avoids a new runtime dependency but does not provide
  schema completion.
- Extremely deep JSON can produce a large tree; collapsed containers and raw
  JSON provide a bounded alternative. Virtualized rendering is deferred unless
  real-world data demonstrates a performance problem.
