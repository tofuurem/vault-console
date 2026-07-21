# Vault Console Phase 1 Design

Date: 2026-07-21
Status: Approved

## 1. Purpose

Vault Console is a frontend-only web interface for a self-hosted HashiCorp
Vault Community cluster. The first phase replaces the most cumbersome
day-to-day KV v2 and `userpass` workflows without attempting to expose every
Vault feature.

The project starts from the generated React prototype in `prototype/`. The
prototype is a visual reference, not production-ready source to copy unchanged.

## 2. Goals

- Authenticate with a Vault token or a `userpass` username and password.
- Browse accessible KV v2 mounts as a fast, permission-aware file explorer.
- Create and edit KV v2 secrets safely.
- Inspect, compare, soft-delete, restore, and destroy secret versions.
- Create a `userpass` account without requiring the administrator to write HCL
  or use the Vault CLI.
- Generate a strong password and hand it to the administrator once.
- Assign groups, reusable access roles, and direct KV path access visually.
- Show one explainable effective-access tree that combines every selected
  source.
- Generate correct KV v2 ACL policies and expose the resulting HCL only as an
  advanced preview.
- Apply multi-endpoint Vault changes with preflight checks, progress, retry, and
  best-effort compensation.

## 3. Non-goals

Phase 1 does not include:

- Database, Transit, SSH, PKI, cloud, or other secrets engines.
- Vault Enterprise namespaces, Sentinel, SCIM, or secrets sync.
- LDAP, OIDC, Kubernetes, AppRole, or cloud authentication administration.
- Audit-log ingestion, user activity history, or access analytics.
- A custom application backend or a second user/permission database.
- General visual editing of arbitrary external HCL policies.
- Empty KV folders. KV folders remain virtual prefixes derived from secret
  paths.

## 4. Primary users

The primary user is a DevOps or platform engineer administering their own Vault
cluster. A secondary user is a developer whose Vault token only exposes the KV
mounts and paths allowed by their policies.

The UI must adapt to the current token. Administrative navigation and mutation
actions are hidden when the token cannot perform them. A denied API request is
still handled explicitly because hidden navigation is not an authorization
boundary.

## 5. Information architecture

### 5.1 Authentication

The login screen supports two methods:

- Token: Vault address and masked token.
- Username and password: Vault address, `userpass` mount, username, and
  password.

The Vault token is held in memory. Refreshing or closing the tab ends the UI
session. Persisting a token in local or session storage is outside Phase 1.

Before login, the UI checks cluster reachability and sealed state. TLS errors,
an unreachable server, a sealed cluster, invalid credentials, and permission
denials have distinct messages.

### 5.2 KV v2 explorer

The explorer preserves the prototype's desktop-first three-column layout:

1. Accessible KV mounts and virtual folders.
2. Current folder contents with breadcrumbs and search.
3. A collapsible secret inspector.

Secret values are masked by default. Values are revealed individually and
automatically hidden again. Copying a value does not require permanently
revealing it.

Creation and editing happen in a contextual drawer. Saving a changed secret
creates a new KV v2 version and uses check-and-set to detect concurrent edits.

Version management includes comparison, restore-as-new-version, soft delete,
undelete, permanent version destruction, and metadata deletion. Irreversible
operations require typed path confirmation.

### 5.3 Access control

Administrative navigation contains:

- Users
- Groups
- Roles
- Policy explorer

The user list and profile reuse the prototype's compact DevTools presentation.
The user profile explains access sources instead of presenting a flattened,
untraceable list.

## 6. Access-control concepts

The UI maps its concepts to Vault as follows:

| UI concept | Vault representation |
| --- | --- |
| User account | Account under an enabled `userpass` auth mount |
| Identity | Identity entity |
| Login binding | Entity alias using the `userpass` mount accessor |
| Role | UI-managed ACL policy named `vc-role-<slug>` |
| Group | Internal identity group with policies and member entity IDs |
| Direct role | ACL policy attached directly to the `userpass` account |
| Direct path access | Generated ACL policy named `vc-user-<username>` |

Roles inherited through a selected group are not attached a second time as
direct roles. The UI labels their source, for example `Platform Readers via
platform-team`.

Policies created outside Vault Console are classified as external. They can be
listed, attached, searched, and viewed as raw HCL. They are not visually
editable in Phase 1. When an external policy cannot be interpreted safely, the
effective-access view warns that it may add permissions instead of claiming an
exact result.

## 7. Create-user workflow

Creating a user has two decision screens.

### 7.1 Step 1: Account

The account form contains:

- `userpass` mount selector
- Username
- Optional display name stored on the identity entity
- Generated password
- Reveal, copy, and regenerate actions
- Password strength and length feedback

The generator uses a cryptographically secure browser source. Passwords are
never generated with `Math.random`, written to persistent browser storage,
placed in URLs, or included in logs.

### 7.2 Step 2: Access

Groups, roles, direct access, and effective access live on one screen.

The screen contains:

- A searchable group picker.
- An advanced direct-role picker.
- A single effective KV tree.
- Direct path editing inside that same tree.
- A persistent summary of groups, role sources, direct grants, explicit denies,
  and dangerous Owner access.

Selecting or removing a group or role immediately recomputes the tree. A role
already supplied by a group is disabled in the direct-role picker and labelled
with its group source.

Every logical path supports these editor states:

- `Inherited`: no direct rule; show the effective result and its source.
- `View`
- `Edit`
- `Manage versions`
- `Owner`
- `Deny`

`Inherited` and `Deny` are never represented by the same value. Clearing a
direct rule returns the path to `Inherited`; it does not generate a deny.

Inherited rows show the granting group or role. Direct rules show an override
badge. Explicit denies are visually prominent and explain that they can defeat
grants from other policies.

### 7.3 Confirmation, apply, and success

`Create user` opens a compact confirmation modal. This modal contains:

- Account summary
- Selected groups and direct roles
- Effective access summary
- Direct grants and denies
- Warnings for Owner or broad recursive access
- Collapsed generated-HCL preview
- Collapsed mutation-plan preview

Review is not a separate wizard step.

After confirmation, the same modal becomes an operation-progress view. Apply is
not a separate decision step. On success it becomes a one-time password handoff
with copy username, copy password, and copy both actions.

## 8. Vault ACL semantics

The effective-access engine follows Vault's path matching rather than treating
permission presets as a simple numeric maximum.

- Vault evaluates the most-specific matching path pattern.
- When the same path pattern occurs in multiple policies, capabilities are
  combined.
- When different applicable patterns exist, only the highest-priority pattern
  determines capabilities.
- `deny` takes precedence over other capabilities.
- An exact or more-specific rule can supersede a broader glob.
- The UI detects cases where an apparent downgrade would be combined with an
  equally specific grant and refuses to present a false effective result.

The effective-access result retains provenance. Each capability bundle records
the policy, direct role, group role, or per-user rule responsible for it.

External policies that cannot be parsed by the supported policy reader are
shown as unresolved sources rather than ignored.

## 9. Permission presets and KV v2 compilation

Presets are a UI convenience. The compiler expands a logical mount/path rule
into the distinct KV v2 API paths needed for data, metadata, and version
operations.

| Preset | Logical operations |
| --- | --- |
| View | Browse folders, read metadata, read secret values |
| Edit | View plus create, replace, and patch secret data |
| Manage versions | Edit plus soft-delete and undelete versions |
| Owner | Manage versions plus destroy versions and delete metadata |
| Deny | Deny the corresponding data, metadata, and version-operation paths |

The compiler produces rules for the appropriate `<mount>/data/`,
`<mount>/metadata/`, `<mount>/delete/`, `<mount>/undelete/`, and
`<mount>/destroy/` paths. It also grants the minimum metadata-list access needed
to traverse the selected virtual folder hierarchy.

The visual tree operates on logical paths, while generated policies operate on
real Vault API paths. These representations are kept separate.

## 10. Component boundaries

The existing 739-line wizard is replaced by focused units:

- `AccountForm`: account fields and password lifecycle.
- `AccessSourcePicker`: groups and direct roles.
- `EffectivePermissionTree`: logical KV tree, effective levels, and provenance.
- `DirectAccessEditor`: direct grants, inherited state, and explicit denies.
- `AccessSummary`: persistent human-readable result.
- `CreateUserConfirmation`: final confirmation and advanced previews.
- `ApplyProgress`: mutation state, retry, and compensation status.
- `PasswordHandoff`: one-time credential delivery.

The domain layer contains:

- Access-control types and permission presets.
- A KV v2 policy compiler.
- Vault path-pattern matching and priority comparison.
- Effective-access resolution with provenance.
- Mutation-plan and compensation-plan builders.

The infrastructure layer contains the HTTP client, authentication session,
Vault endpoint adapters, response validation, error translation, and request
cancellation. React components do not construct endpoint URLs or HCL.

## 11. Create-user data flow

### 11.1 Preflight

Before any write, the UI:

1. Checks cluster reachability and sealed state.
2. Loads the selected `userpass` mount and accessor.
3. Checks for username, entity-name, alias, and managed-policy conflicts.
4. Loads selected groups and supported policies.
5. Resolves effective access and validates generated KV v2 policy paths.
6. Builds a mutation plan and matching compensation plan.

### 11.2 Apply

Only required operations are included:

- A per-user policy is created only when direct grants or denies exist.
- A `userpass` account, identity entity, and entity alias are created.
- The entity is added to selected groups.
- Only genuinely direct roles are attached to the userpass account.

Each write records enough prior state for retry or compensation. Operations are
idempotent where Vault permits it. The UI does not claim atomicity across Vault
endpoints.

### 11.3 Partial failure

A partial failure shows:

- Completed, failed, pending, and compensated operations.
- A plain-language error category.
- Retry from the safe point when possible.
- Best-effort rollback.
- Any object that could not be removed or restored.

Compensation may include deleting a newly created account, alias, entity, or
policy and restoring prior group membership. Existing resources are restored to
their captured state rather than deleted.

## 12. Error behavior

The UI distinguishes:

- Vault unavailable
- Vault sealed
- Session expired
- Authentication rejected
- Insufficient capability
- Resource conflict
- Concurrent KV version conflict
- Unsupported or unresolved external policy
- Invalid generated policy
- Partial multi-endpoint failure
- Compensation failure

Errors exclude Vault tokens, passwords, secret values, response bodies that may
contain secrets, and upstream messages that have not been classified as safe.

Closing or cancelling account creation clears the generated password. Leaving
the success handoff permanently removes it from application state.

## 13. Frontend deployment

The UI calls the Vault HTTP API directly. Production deployment must use TLS.
It should preferably be served behind the same origin as Vault through a reverse
proxy. A separate origin requires an explicit Vault CORS configuration.

The UI never weakens Vault authorization. Visibility checks and disabled
controls are usability features; every mutation still relies on Vault ACL
enforcement.

## 14. Prototype migration

The generated `prototype/` directory supplies the approved visual language and
interaction reference. Migration into the project root will:

- Preserve the app shell, explorer density, typography, and base components.
- Replace mock-only page state with domain and infrastructure boundaries.
- Split oversized access-control components.
- Remove unused Firebase, Supabase, Stripe, Recharts, and other unrelated
  dependencies.
- Replace mock delays and impossible error branches with explicit operation
  state machines.
- Replace insecure password generation with Web Crypto.
- Add a lockfile and deterministic package scripts.
- Keep mock adapters available only for Storybook-like development and tests.

The `prototype/` directory remains untouched until the migration plan defines
which files are reused, rewritten, or removed.

## 15. Testing strategy

### 15.1 Unit tests

- Vault path-pattern priority and equality.
- Capability unions for identical patterns.
- Exact and more-specific path precedence.
- Explicit deny precedence.
- KV v2 preset compilation for every endpoint family.
- Required ancestor metadata-list rules.
- Group, direct-role, and per-user policy composition.
- External-policy unresolved states.
- Mutation and compensation planning.
- Cryptographically secure password constraints without asserting exact values.

### 15.2 Component tests

- Selecting a group updates the effective tree immediately.
- A role inherited through a group cannot be selected twice directly.
- Clearing a direct rule returns to `Inherited`.
- `Deny` remains distinct and produces a warning.
- Summary and confirmation always match the tree.
- Dangerous access requires confirmation.
- Password handoff disappears permanently when closed.

### 15.3 Integration tests

Tests run against a disposable Vault Community server and cover:

- Token and `userpass` login.
- KV v2 mount discovery and CRUD.
- Version comparison, CAS conflict, delete, undelete, restore, and destroy.
- Creating a user, entity, alias, group membership, and policy.
- Logging in as the new user and verifying allowed and denied paths.
- A forced mid-plan failure followed by compensation.

### 15.4 End-to-end scenarios

- Create a group-only user.
- Create a direct-role-only user.
- Add a more-specific direct grant below a broad group grant.
- Add an explicit deny below a broad group grant.
- Attempt a misleading same-pattern downgrade.
- Create a user without any access and confirm the warning.
- Lose the administrator session during apply.
- Recover from a partial failure without duplicate objects.

## 16. Acceptance criteria

- User creation has two decision screens: Account and Access.
- Groups, roles, direct rules, and effective access appear on one Access screen.
- Group selection immediately changes the effective tree.
- No role is attached twice through both a group and directly.
- `Inherited` never compiles to an explicit deny.
- The Review and Apply wizard steps no longer exist.
- Confirmation, progress, and password handoff share one modal flow.
- Generated policies use real KV v2 endpoint paths.
- Effective-access explanations follow Vault priority rules and retain sources.
- External policies are never silently omitted from the explanation.
- Password generation and handling do not use persistent storage or
  non-cryptographic randomness.
- Partial failures are visible, retryable where safe, and compensatable on a
  best-effort basis.
- Relevant unit, component, integration, and end-to-end tests pass.
