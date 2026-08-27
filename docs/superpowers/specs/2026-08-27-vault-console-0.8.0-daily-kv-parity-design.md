# Vault Console 0.8.0 Daily KV v2 Parity Design

- Date: 2026-08-27
- Status: implemented; release verification pending
- Target release: `0.8.0`
- Product profile: authenticated app-like admin console

## Purpose

Vault Console already covers the normal KV v2 read, write, version-history,
comparison, restore, soft-delete, undelete, version-destroy, search, and access
management workflows. The remaining daily KV v2 gaps are concentrated in four
areas:

1. destructive actions do not clearly distinguish deleting version data from
   deleting the key and its metadata;
2. the current token cannot be copied or revoked from Vault Console;
3. least-privilege users cannot open a known path or perform an intentional
   write-only update when directory or data reads are denied;
4. key metadata and KV mount defaults cannot be managed.

Release `0.8.0` closes these gaps in one release and removes the unused table
density preference. The goal is daily functional parity for KV v2 and the
current Vault session, not full parity with every native Vault UI surface.

## Scope

### Included

- Permanent deletion of one key, including all versions and metadata.
- Permanent deletion of multiple selected keys with per-key results.
- Correct endpoint and capability handling for latest-version deletion,
  explicit-version deletion, undelete, version destroy, and metadata deletion.
- Permanent destruction of a version that was previously soft-deleted.
- Current-token copy, renewal, self-revocation, and local sign-out.
- Exact-path access that does not depend on directory `LIST` permission.
- Explicit write-only secret creation or replacement flows.
- Full supported KV v2 key metadata display and editing.
- KV v2 mount configuration display and editing.
- Removal of Compact/Comfortable density controls and persistence.
- Documentation, policy guidance, regression tests, and a multi-architecture
  `0.8.0` container release.

### Excluded

- Changes to Access Center behavior, data models, or lifecycle operations.
- Other secrets engines, auth methods, namespaces, Enterprise features, and
  general system administration.
- Disabling or deleting a KV secrets-engine mount.
- Response wrapping, an expanded API/CLI reference screen, and other optional
  native-UI convenience features.
- Automatic token renewal.

## Confirmed Current-State Findings

### Permanent deletion is implemented but operationally hidden

The adapter already supports `DELETE <mount>/metadata/<path>`, but the action
is available only after selecting a secret, opening Inspector, opening the
Metadata tab, successfully reading metadata, and having the exact delete
capability. The bulk Destroy operation destroys selected version data and
intentionally leaves the key metadata record.

This makes two technically different operations look like one cleanup action.
It also prevents a token with metadata `delete` but without metadata `read`
from using the permanent-delete UI.

### Latest-version deletion uses the explicit-version endpoint

The current UI sends both latest-version and selected-version deletion through
`POST <mount>/delete/<path>`. Vault defines latest-version deletion as
`DELETE <mount>/data/<path>` and selected-version deletion as
`POST <mount>/delete/<path>`. These paths require different capabilities.

### Soft-deleted versions cannot be destroyed from the UI

The current version action menu suppresses Destroy whenever a version has a
deletion timestamp. Vault permits destroying a soft-deleted version as long as
it has not already been destroyed.

### Session actions are incomplete

The session menu exposes renewal only for renewable tokens and supports local
sign-out. It does not expose Copy token or Revoke token. The application
already holds the current token in a redacting `SensitiveValue`, so copying can
be added without rendering the value.

### LIST denial is a dead end

When metadata directory listing returns `403`, Explorer shows an error and a
Retry action. A user with access to an exact secret path cannot enter that path
in the UI. Editing is also conditioned on successfully reading secret data,
which excludes intentional write-only policies.

### Metadata and mount configuration are read only or absent

The current secret history model exposes current version, oldest version,
custom metadata, and version states. It omits key creation/update timestamps,
`max_versions`, `cas_required`, and `delete_version_after`. There is no metadata
write operation or KV mount config gateway.

## Product Design

### 1. Permanent key deletion

Every visible secret row receives an action menu with an explicit
`Delete key permanently…` action when exact capability discovery reports
`delete` or `root` for `<mount>/metadata/<path>`. If capability discovery is
unavailable, the action remains available and Vault remains authoritative.
Known denial hides or disables the action with an exact-path explanation.

The same action remains available from the selected secret's Metadata tab,
but it no longer depends on metadata being readable. Metadata content and the
ability to delete the metadata resource are evaluated independently.

Single-key confirmation:

- names the operation `Delete key permanently`;
- explains that all data, versions, custom metadata, and history will be
  removed;
- shows the exact logical path;
- requires typing the full `<mount>/<path>` value;
- never displays secret values.

Bulk selection receives three distinct destructive actions:

1. `Soft-delete current versions`;
2. `Destroy selected versions`;
3. `Delete selected keys permanently`.

Bulk permanent deletion performs bounded-concurrency preflight and execution.
The confirmation lists the sorted target paths, shows the eligible and
excluded counts, and requires the phrase `DELETE <N> KEYS`, where `N` is the
eligible count. No folder can be selected as a deletion target.

Each result is classified as:

- `succeeded`: Vault accepted the delete;
- `denied`: preflight or Vault denied the exact metadata path;
- `missing`: Vault reports that the key is already absent;
- `failed`: another sanitized failure occurred.

A missing key is an idempotent outcome, remains visible in the result summary,
and is removed from stale local directory state after refresh. Partial success
does not hide failed or denied targets.

After successful permanent deletion, Vault Console invalidates the exact
secret, metadata, permission, directory, and search queries; clears selection
for deleted paths; closes a deleted selected secret; and removes matching
favorites and recent-path entries.

### 2. Version operations

The UI and gateway expose distinct operations:

| User action | Vault request | Required capability |
| --- | --- | --- |
| Delete latest version | `DELETE <mount>/data/<path>` | `delete` on data path |
| Delete selected versions | `POST <mount>/delete/<path>` | `update` on delete path |
| Undelete selected versions | `POST <mount>/undelete/<path>` | `update` on undelete path |
| Destroy selected versions | `PUT <mount>/destroy/<path>` | `update` on destroy path |
| Delete key permanently | `DELETE <mount>/metadata/<path>` | `delete` on metadata path |

The permission model adds separate `canDeleteLatest` and
`canDeleteVersions` decisions. Version Destroy is available for every
non-destroyed version, including soft-deleted versions. Labels and confirmation
copy always name whether the operation affects a version or the entire key.

### 3. Current-session profile

The session menu keeps `System`, `Light`, and `Dark` appearance choices and
replaces density controls with a compact session summary:

- display identity;
- authentication method;
- Vault address;
- remaining TTL or `No fixed expiry`;
- renewable state;
- last successful renewal state when applicable.

Actions are:

- `Copy token`: copies the current token without displaying it;
- `Renew token`: visible only when the current token is renewable;
- `Revoke token…`: revokes the calling token in Vault;
- `Clear recent & favorite paths`;
- `Sign out`: clears only the local tab session.

Copy token calls `VaultToken.reveal()` only inside the clipboard action. The
raw token must never enter markup, component state, toast text, diagnostics,
errors, analytics, or logs.

Revoke uses `POST /auth/token/revoke-self`. Its confirmation explains that the
current token, child tokens, and leases or dynamic secrets created by the token
can be revoked. One request may be active at a time.

On revoke success, the application clears session storage, navigation session
data, all Vault query caches, in-memory capability state, and current
selection, then redirects to Login with a `Token revoked` notice. On an
ordinary revoke failure, the current session remains active and the sanitized
error remains visible. An invalid-token response follows the existing expired
session path.

### 4. Exact-path access

Explorer exposes `Open exact path` in the active mount header. The same form
replaces the dead-end directory error when `LIST` is denied. The input accepts
a secret path relative to the active mount, normalizes one optional leading
slash, rejects empty segments, dot segments, control characters, and a trailing
slash, and never interprets the value as an API path.

Successful submission navigates through the existing canonical Explorer URL
using `?secret=<logical-path>`. Directory listing and selected-secret loading
remain independent, so a selected exact path can load even while the current
directory query is denied.

The selected path performs exact capability discovery for data, metadata,
delete, undelete, and destroy paths. Readable resources are requested
independently; denied resources are not fetched merely to produce predictable
`403` responses.

### 5. Write-only workflow

When secret data is unreadable but the exact data path permits `create` or
`update`, Inspector offers `Write new version…`. This opens a dedicated
write-only editor rather than initializing the normal edit form with an empty
object.

The editor states that this is a full replacement and that unknown existing
fields cannot be preserved. It supports the existing key/value and JSON modes,
but it does not claim to show a diff.

CAS strategy is explicit:

- If metadata is readable, the current version is used as CAS and is shown in
  Review.
- If metadata is unreadable, the default is `Create only (CAS 0)`.
- The user may deliberately select `Write without CAS`, which omits the CAS
  option and requires a second acknowledgement that an existing secret can be
  replaced.

If Vault requires CAS and the UI cannot determine the current version, the
request fails safely with guidance to obtain metadata read access or provide a
workflow with a known current version. Vault remains authoritative for create
versus update capability and mount/key CAS configuration.

### 6. Key metadata

The metadata model includes:

- `created_time` and `updated_time`;
- `current_version` and `oldest_version`;
- `max_versions`;
- `cas_required`;
- `delete_version_after`;
- `custom_metadata`;
- per-version creation, deletion, and destruction state.

Inspector displays all readable fields. Custom metadata returned by the data
endpoint remains displayable when data is readable but the metadata endpoint
is not.

`Edit metadata…` requires both read and update capability on the exact metadata
path. The form edits custom key/value pairs, maximum versions, required CAS,
and automatic deletion duration. It validates non-negative integer version
limits, unique non-empty custom metadata keys, and a Vault duration or `0s`.

The editor reads a fresh metadata snapshot immediately before saving and sends
the complete supported metadata settings. It does not offer blind editing when
the current settings cannot be read. A successful save invalidates the secret
metadata and detail queries.

Permanent delete remains available with delete capability even when metadata
read capability is absent; metadata editing does not.

### 7. KV mount configuration

The active mount header receives a `Configuration` action. It opens a dedicated
drawer scoped to the active KV v2 mount and shows:

- default maximum versions;
- default CAS requirement;
- default delete-version-after duration.

The gateway reads and updates `<mount>/config`. Editing requires both read and
update capability so that settings are never reset through a blind write. The
drawer distinguishes effective mount defaults from per-key metadata overrides.

Mount disabling, mount deletion, tune settings unrelated to KV versioning, and
other secrets-engine administration remain outside this release.

### 8. Density removal

Explorer tables always use Comfortable spacing. Vault Console removes:

- `WorkspacePreferencesProvider` and context;
- the density type and persistence functions;
- density props and conditional table classes;
- density session-menu controls;
- density Command Palette commands.

At startup, the browser-storage migration removes the obsolete
`vc-console:workspace-preferences:v1` record. It also continues to remove the
legacy `vault-console:workspace-preferences:v1` record without recreating it,
which preserves native Vault UI compatibility. Theme, Inspector layout,
favorites, and recent-path persistence remain unchanged. The migration never
touches native `vault-*` records.

## Architecture

### Domain contracts

`VaultAuthGateway` adds:

```text
revokeSelf(session, signal?) -> Promise<void>
```

`KvV2Gateway` separates the existing write and destructive operations and adds:

```text
deleteLatestSecret(session, mount, path, signal?)
readSecretMetadata(session, mount, path, signal?)
updateSecretMetadata(session, mount, path, input, signal?)
readMountConfig(session, mount, signal?)
updateMountConfig(session, mount, input, signal?)
```

Secret writes accept a typed strategy that maps to a known version CAS, CAS 0,
or omitted CAS. Callers cannot accidentally encode these three cases as the
same number.

Key metadata, mount configuration, and write strategy use focused domain types.
Access-control contracts remain unchanged.

### Infrastructure adapters

The KV adapter remains the only layer that constructs KV API paths. It maps
the operation table above exactly and validates every response field at the
boundary. The auth adapter adds revoke-self without including the token in the
request body.

### Application services

Bulk metadata deletion is a separate service from bulk version destruction.
It follows the existing preflight/execution/result pattern, with bounded
concurrency and `AbortSignal` support.

Session renewal and revocation use independent serialized operation states.
Revoke cleanup is exposed as one context action so UI components cannot forget
part of the local session reset.

Exact-path selection reuses existing route state. Write-only behavior is an
explicit application state derived from capabilities and resource results, not
an effect sequence hidden inside the editor.

### UI boundaries

- `TopBar` owns only presentation and invokes session callbacks.
- A focused revoke confirmation component owns destructive session copy.
- Secret row actions and Inspector share the same permission decisions.
- Single and bulk permanent-delete confirmations are separate components.
- Metadata and mount configuration use separate editors and validation models.
- Explorer coordinates mutations and query invalidation without embedding API
  path construction.

## Permission and Failure Rules

- Exact capabilities are advisory UI gates; the Vault request is authoritative.
- Known denial prevents a mutation and names the exact denied path.
- Unavailable capability discovery does not falsely claim denial.
- `403` remains an authorization result unless the shared HTTP boundary
  confirms an invalid token.
- `404` during permanent deletion is reported as `missing`.
- CAS conflicts preserve editor input and offer refresh/retry guidance.
- Metadata and mount configuration never perform blind replacement.
- Revoke failure never clears an otherwise valid session.
- Revoke success and confirmed invalid-token responses clear all session-bound
  state.
- Errors, diagnostics, and bulk reports exclude tokens and secret values.

## Testing Strategy

### Unit tests

- Endpoint and capability mapping for every version and metadata operation.
- Rich metadata and mount-config response validation.
- Typed CAS strategies and request bodies.
- Exact-path normalization and rejection cases.
- Bulk metadata-delete preflight, concurrency, idempotent missing results,
  partial failures, aborts, and summaries.
- Revoke state serialization and local cleanup behavior.
- Browser storage cleanup after density removal.

### Component tests

- Row and Inspector actions share permissions.
- Single and bulk confirmation requirements.
- Soft-deleted versions expose Destroy.
- LIST-denied exact-path form.
- Write-only Review and CAS choices.
- Metadata and mount config read/edit/error states.
- Copy token never renders the raw token.
- Renew, revoke, and local sign-out remain distinct.
- Density controls and commands no longer render.

### Real Vault integration

- Latest delete, explicit version delete, undelete, destroy of a soft-deleted
  version, and metadata delete use the intended endpoints and outcomes.
- Bulk permanent deletion removes keys from subsequent metadata lists.
- Custom metadata and key retention settings round-trip.
- Mount configuration round-trips.
- A list-denied exact-path token reads its allowed secret.
- Write-only policies cover CAS 0, known-version CAS, no-CAS replacement, and
  a Vault-required-CAS rejection.
- Revoke-self invalidates the token and subsequent requests.

### Browser E2E

- Single and bulk permanent-delete journeys.
- Partial bulk result presentation.
- Version-operation labels and soft-deleted version destruction.
- Copy token clipboard behavior without DOM exposure.
- Renew and revoke session behavior.
- Exact-path access with directory `LIST` denied.
- Write-only editor warnings and Review.
- Metadata and mount configuration edits.
- Absence of density controls after upgrade.
- Existing theme, Explorer, Access Center, responsive, and native UI
  compatibility regressions remain green.

The full suite runs against Vault Community `1.21.3` and `2.0.3` where the
harness supports version selection. Type-check, lint, unit tests, production
build, container smoke, Caddy validation, and policy-format validation remain
release gates.

## Release Plan

After all acceptance criteria pass:

1. bump package and lockfile versions to `0.8.0`;
2. update README, usage, policy examples, and troubleshooting;
3. create the release commit and annotated `v0.8.0` tag;
4. push `main` and the tag;
5. publish
   `zero-noise-registry.registry.twcstorage.ru/vault-console:0.8.0` for
   `linux/amd64` and `linux/arm64`;
6. verify the remote manifest, immutable digest, and `/healthz` from the
   published image;
7. record the digest in project documentation without moving the release tag.

## Acceptance Criteria

- A user can permanently remove one key or multiple selected keys, and the
  removed keys no longer appear in metadata listing.
- The UI never describes version destruction as key deletion.
- Every delete, undelete, destroy, and metadata-delete action uses the correct
  Vault endpoint and exact capability.
- A soft-deleted version can be permanently destroyed.
- The current token can be copied, renewed when renewable, and self-revoked.
- Local sign-out does not revoke the token.
- A known secret path can be opened without directory `LIST` permission.
- A write-only user can intentionally choose a safe CAS strategy and receives
  an explicit full-replacement warning.
- Key metadata and KV mount defaults can be viewed and safely edited.
- Compact/Comfortable controls, commands, state, and storage are gone while
  theme choices remain.
- Access Center behavior is unchanged.
- No raw token or secret value enters markup, logs, diagnostics, toasts, or
  bulk reports.
- Tests and release checks pass on the declared Vault versions and container
  architectures.

## References

- [Vault KV secrets engine](https://developer.hashicorp.com/vault/docs/secrets/kv)
- [Vault KV metadata command](https://developer.hashicorp.com/vault/docs/commands/kv/metadata)
- [Vault token API](https://developer.hashicorp.com/vault/api-docs/auth/token)
- [Native Vault 2.0.3 KV UI source](https://github.com/hashicorp/vault/tree/v2.0.3/ui/lib/kv)
- [Native Vault 2.0.3 user menu](https://github.com/hashicorp/vault/blob/v2.0.3/ui/lib/core/addon/components/sidebar/user-menu.hbs)
