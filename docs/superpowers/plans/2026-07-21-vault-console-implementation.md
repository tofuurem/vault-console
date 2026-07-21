# Vault Console Phase 1 Implementation Plan

Date: 2026-07-21
Design: `docs/superpowers/specs/2026-07-21-vault-console-design.md`
Starting branch: `main`
Starting design commit: `d5096f558316b9c7a20eab2c44185c549d404929`

## Goal

Turn the generated `prototype/` React application into the project root, retain
its approved visual language, and replace its mock-only architecture with a
tested frontend-only Vault Community client for token/userpass authentication,
KV v2 secret management, and visual user/group/role onboarding.

## User-visible outcome

- A user can log in with a token or a `userpass` account.
- A user only sees KV v2 mounts and operations allowed by Vault.
- KV secrets can be created, edited with CAS, compared, restored, deleted,
  undeleted, and destroyed through guarded flows.
- An administrator can create a `userpass` user in two decision screens:
  Account and Access.
- Group selection immediately updates one effective-access tree.
- Direct roles cannot duplicate roles inherited through groups.
- Direct path rules distinguish Inherited from Deny.
- Confirmation, apply progress, rollback status, and one-time password handoff
  use one modal flow.

## Non-goals

The implementation excludes non-KV secret engines, Enterprise namespaces,
audit analytics, non-userpass auth administration, a custom backend, and visual
editing of arbitrary external HCL policies.

## Phase 0: Establish the frontend baseline

Phase base: `d5096f558316b9c7a20eab2c44185c549d404929`

### Task 0.1: Add repository hooks

Files:

- `.githooks/pre-commit`
- `.githooks/pre-push`

Acceptance criteria:

- `core.hooksPath` points at `.githooks`.
- Pre-commit runs staged whitespace checks and available frontend quality gates.
- Pre-push runs typecheck, lint, tests, and production build when configured.

Verification:

```sh
git config --get core.hooksPath
find .githooks -maxdepth 1 -type f -perm -111 -print
```

Status: completed in commit `2f73ce5`.

### Task 0.2: Record the implementation plan

Files:

- `docs/superpowers/plans/2026-07-21-vault-console-implementation.md`

Acceptance criteria:

- Every phase has bounded tasks, acceptance criteria, narrow verification, and
  a phase commit message.
- The plan matches the approved design.

Verification:

```sh
rg -n "TBD|TODO|FIXME" docs/superpowers/plans/2026-07-21-vault-console-implementation.md
git diff --check
```

### Task 0.3: Move the prototype into the project root

Files and directories:

- Move `prototype/src/` to `src/`.
- Move `prototype/eslint-rules/` to `eslint-rules/`.
- Move root configuration and entry files from `prototype/`.
- Remove the empty `prototype/` directory.
- Replace the generated `project_plan.md` with the approved spec/plan docs.

Acceptance criteria:

- Application source and configuration live at the repository root.
- No `prototype/` directory remains.
- No existing design or plan document is overwritten.
- Git detects moves where possible.

Verification:

```sh
test ! -d prototype
test -f package.json
test -f src/main.tsx
git status --short
```

### Task 0.4: Prune dependencies and establish deterministic tooling

Expected files:

- `package.json`
- `package-lock.json`
- `eslint.config.ts` or existing ESLint configuration
- `vite.config.ts`
- `vitest.config.ts` when separate configuration is clearer
- `src/test/setup.ts`

Acceptance criteria:

- Firebase, Supabase, Stripe, Recharts, and other unused generated dependencies
  are removed.
- Vitest, Testing Library, user-event, and jsdom are configured.
- Scripts include `dev`, `build`, `type-check`, `lint`, `test`, `test:run`, and
  `quality`.
- Dependency installation produces a committed lockfile.

Narrow verification:

```sh
npm install
npm run type-check
npm run build
```

### Task 0.5: Repair the imported baseline

Expected files:

- Imported `src/` and configuration files only where required by failures.

Acceptance criteria:

- Imported routes render.
- Existing prototype interactions compile.
- Lint, typecheck, and build pass without broad suppressions.
- No functional redesign is mixed into this task.

Verification:

```sh
npm run quality
npm run build
```

Phase-level verification:

```sh
npm run quality
npm run build
git diff --check
```

Intended phase commit:

```text
chore: establish Vault Console frontend baseline
```

## Phase 1: Build the Vault domain and API foundation

### Task 1.1: Define session, error, and gateway contracts

Expected subsystem:

- `src/domain/vault/`
- `src/infrastructure/vault/`

Acceptance criteria:

- Tokens and passwords use redacted types at logging/error boundaries.
- Vault errors are translated into sealed, unavailable, authentication,
  authorization, conflict, invalid-response, and unknown categories.
- React components depend on gateway interfaces rather than endpoint strings.

Verification:

```sh
npm run test:run -- vault-errors
npm run type-check
```

### Task 1.2: Implement ACL types and Vault path matching

Expected files:

- `src/domain/access-control/types.ts`
- `src/domain/access-control/policy-matcher.ts`
- matching unit tests

Acceptance criteria:

- Exact, `*`, and `+` patterns follow Vault priority rules.
- Identical patterns union capabilities.
- Different patterns select the highest-priority match.
- Explicit deny always wins for the selected pattern.
- Results retain policy/group/role provenance.

Verification:

```sh
npm run test:run -- policy-matcher
```

### Task 1.3: Implement KV v2 permission compilation

Expected files:

- `src/domain/access-control/permission-presets.ts`
- `src/domain/access-control/kv-v2-policy-compiler.ts`
- compiler unit tests

Acceptance criteria:

- View, Edit, Manage versions, Owner, and Deny expand to correct `data`,
  `metadata`, `delete`, `undelete`, and `destroy` rules.
- Required parent metadata-list rules are minimal and deterministic.
- Inherited never produces HCL.
- Output is stable for review and snapshot tests.

Verification:

```sh
npm run test:run -- kv-v2-policy-compiler
```

### Task 1.4: Implement effective-access resolution

Expected files:

- `src/domain/access-control/effective-access.ts`
- resolver unit tests

Acceptance criteria:

- Group roles, direct roles, and per-user rules resolve into one tree model.
- Duplicate direct roles inherited through a group are reported and removed.
- Unsupported external policies produce an unresolved source warning.
- Misleading same-pattern downgrades are rejected.

Verification:

```sh
npm run test:run -- effective-access
```

### Task 1.5: Implement the HTTP client and endpoint adapters

Expected subsystem:

- `src/infrastructure/vault/http/`
- `src/infrastructure/vault/auth/`
- `src/infrastructure/vault/kv-v2/`
- `src/infrastructure/vault/access-control/`

Acceptance criteria:

- Requests use `/v1/`, `X-Vault-Token`, abort signals, and JSON validation.
- Token and userpass login work through one session boundary.
- Adapters cover health/seal status, mount discovery, KV v2 operations,
  policies, userpass accounts, entities, aliases, and internal groups.
- Request and error representations never include secret-bearing payloads.

Verification:

```sh
npm run test:run -- vault-http
npm run type-check
```

Phase-level verification:

```sh
npm run quality
npm run build
```

Intended phase commit:

```text
feat: add Vault domain and API foundation
```

## Phase 2: Replace the create-user wizard

### Task 2.1: Introduce the account form and secure password lifecycle

Expected files:

- `src/pages/access-control/components/create-user/AccountForm.tsx`
- `src/domain/access-control/password.ts`
- tests

Acceptance criteria:

- Password generation uses Web Crypto.
- Password state is cleared on cancel and after leaving handoff.
- Account validation is accessible and field-local.

Verification:

```sh
npm run test:run -- AccountForm password
```

### Task 2.2: Build the unified Access screen

Expected files:

- `AccessSourcePicker.tsx`
- `EffectivePermissionTree.tsx`
- `DirectAccessEditor.tsx`
- `AccessSummary.tsx`
- focused tests

Acceptance criteria:

- Group selection updates the tree immediately.
- Inherited group roles show their source.
- Direct-role duplicates are disabled.
- Inherited, direct grants, and Deny are distinct.
- Clearing a direct rule restores Inherited.
- Keyboard and focus-visible behavior work across the tree.

Verification:

```sh
npm run test:run -- AccessSourcePicker EffectivePermissionTree AccessSummary
```

### Task 2.3: Build confirmation, apply, and handoff modal states

Expected files:

- `CreateUserConfirmation.tsx`
- `ApplyProgress.tsx`
- `PasswordHandoff.tsx`
- workflow reducer and tests

Acceptance criteria:

- Review and Apply are no longer wizard steps.
- One modal transitions through confirmation, progress, failure, and success.
- Owner and broad recursive access require extra confirmation.
- HCL and mutation-plan previews are collapsed by default.
- Partial failure identifies leftovers and safe actions.

Verification:

```sh
npm run test:run -- create-user-workflow
```

### Task 2.4: Replace the old wizard and update profiles

Expected files:

- `CreateUserWizard.tsx` replaced by a focused page-level coordinator.
- `UserProfile.tsx`
- access-control page routing/state

Acceptance criteria:

- Create user has exactly two decision screens.
- User profile reuses the same effective-access components.
- Existing group, role, and policy pages remain reachable.

Verification:

```sh
npm run test:run -- CreateUser UserProfile
npm run build
```

Phase-level verification:

```sh
npm run quality
npm run build
```

Intended phase commit:

```text
feat: simplify user access onboarding
```

## Phase 3: Connect authentication, KV explorer, and access mutations

### Task 3.1: Connect session-aware authentication

Expected subsystem:

- Login page
- Session provider/store
- Router guards

Acceptance criteria:

- Token and userpass login use the real Vault gateway.
- Session remains memory-only.
- Expiration, logout, sealed state, and unreachable server are distinct.
- Administrative navigation derives from capabilities rather than mock flags.

Verification:

```sh
npm run test:run -- auth session
```

### Task 3.2: Connect KV v2 mount discovery and browsing

Expected subsystem:

- Explorer queries/state
- KV v2 gateway
- permission-aware actions

Acceptance criteria:

- Accessible KV v2 mounts and virtual folders load from Vault.
- Loading, empty, denied, deleted, destroyed, and unavailable states render
  near the affected surface.
- Restricted users do not receive admin-only controls.

Verification:

```sh
npm run test:run -- explorer kv-v2
```

### Task 3.3: Connect KV v2 mutations and versions

Expected subsystem:

- Create/edit drawers
- Inspector/version history
- Comparison and destructive dialogs

Acceptance criteria:

- Create and edit use correct KV v2 endpoints and CAS.
- Compare and restore preserve version semantics.
- Soft delete, undelete, destroy, and metadata deletion use guarded paths.

Verification:

```sh
npm run test:run -- kv-v2-mutations
```

### Task 3.4: Connect access-control reads

Expected subsystem:

- Users, groups, roles, policies, entities, and aliases queries
- External-policy classification

Acceptance criteria:

- Lists and profiles come from Vault rather than static mocks.
- UI-managed roles and per-user policies follow stable prefixes.
- External policies are view-only and never silently omitted.

Verification:

```sh
npm run test:run -- access-control-queries
```

### Task 3.5: Connect create-user mutation plans

Expected subsystem:

- Preflight planner
- Mutation executor
- Compensation executor

Acceptance criteria:

- Preflight detects collisions before writes.
- Only necessary policies and assignments are created.
- Failures expose completed work and support safe retry or best-effort rollback.
- Success credentials are removed from state after handoff closes.

Verification:

```sh
npm run test:run -- create-user-mutations
```

Phase-level verification:

```sh
npm run quality
npm run build
```

Intended phase commit:

```text
feat: connect Vault authentication and management workflows
```

## Phase 4: Production hardening and documentation

### Task 4.1: Complete responsive and accessible states

Expected files:

- Shared UI primitives
- App shell and high-traffic pages
- CSS tokens

Acceptance criteria:

- Wide desktop and narrow desktop layouts do not overlap or lose actions.
- Mobile shows a deliberate limited layout rather than a broken desktop grid.
- Icon buttons have accessible names, focus is visible, and modal focus is
  trapped and restored.
- Loading, empty, error, disabled, hover, active, and reduced-motion states are
  complete.

Verification:

```sh
npm run test:run -- accessibility
npm run build
```

### Task 4.2: Add disposable Vault integration coverage

Expected files:

- `scripts/test-vault.sh`
- Vault test configuration/fixtures
- integration tests

Acceptance criteria:

- Tests start an isolated Vault Community dev server or container.
- A generated admin fixture can create a user and verify allowed/denied KV
  paths.
- No real credentials are committed or printed.
- Test cleanup is scoped and reliable.

Verification:

```sh
npm run test:vault
```

### Task 4.3: Add browser-level smoke coverage

Expected files:

- Browser test configuration
- Login, explorer, and create-user scenarios

Acceptance criteria:

- Token login, KV browsing, create-user effective access, and failure recovery
  have smoke coverage.
- Screens are checked at wide and narrow desktop sizes.

Verification:

```sh
npm run test:e2e
```

### Task 4.4: Document deployment and operation

Expected files:

- `README.md`
- `.env.example` when build-time defaults are supported
- reverse-proxy/CORS guidance

Acceptance criteria:

- Local development, production build, Vault URL configuration, same-origin
  deployment, CORS, TLS, and required admin policies are documented.
- Documentation does not include real tokens, passwords, or secret values.

Verification:

```sh
rg -n "TODO|TBD|VAULT_TOKEN=" README.md .env.example 2>/dev/null
npm run build
```

Phase-level verification:

```sh
npm run quality
npm run build
npm run test:vault
npm run test:e2e
git diff --check
```

Intended phase commit:

```text
chore: harden Vault Console for self-hosted deployment
```

## Compatibility and rollout

- The UI targets Vault Community and discovers server behavior at runtime.
- No Vault data migration is required.
- UI-managed policies use stable prefixes and remain ordinary Vault ACL
  policies usable from the CLI.
- The generated prototype has no compatibility contract and is replaced by the
  root application.
- A separate-origin deployment requires Vault CORS configuration; same-origin
  reverse proxy deployment is preferred.

## Final verification

At completion:

```sh
npm run quality
npm run build
npm run test:vault
npm run test:e2e
git diff --check
git status --short
```

Re-read the approved design and confirm every acceptance criterion is either
implemented or explicitly documented as a follow-up. Any final fixes form a
separate stabilization phase and commit.
