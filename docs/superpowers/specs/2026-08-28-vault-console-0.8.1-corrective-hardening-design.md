# Vault Console 0.8.1 Corrective Hardening Design

**Status:** approved for implementation

**Date:** 2026-08-28

**Target release:** 0.8.1

**Base release:** 0.8.0

## Goal

Close the confirmed correctness, responsive-layout, maintainability, dependency,
performance, CI, and container-hardening gaps found in the 0.8.0 audit without
expanding the product beyond the daily KV v2 and session-management contour.

The release must preserve the existing Vault API contract, runtime environment
variables, stored user preferences, and reverse-proxy deployment model.

## Scope

The release includes:

- authoritative fallback behavior when `sys/capabilities-self` is unavailable;
- conflict-safe key metadata and KV mount configuration saves;
- responsive metadata and write-only editors down to a 320 px viewport and at
  the layout equivalent of 400% zoom;
- targeted decomposition of the Explorer orchestration hotspots changed by this
  work;
- deferred and size-aware validation for large JSON documents;
- strict TypeScript and unused-symbol enforcement;
- a bounded complexity quality gate for the Explorer surface;
- the patched React Router dependency and a refreshed security exception ledger;
- CI coverage for quality, build, security, supported Vault versions, and
  production-container browser workflows;
- a non-root, read-only-compatible production container.

Access Center behavior and its existing N+1 request pattern are explicit
non-goals. The release does not add mount deletion, tune endpoints outside the
existing KV v2 configuration form, automatic metadata merging, telemetry, or a
new registry/public API.

## Delivery approach

The work is delivered as a sequence of bounded corrective phases rather than a
minimal hotfix or a broad Explorer rewrite. Each phase produces a coherent,
tested increment and may be reviewed or reverted independently. Refactoring is
limited to code needed to make the corrected behavior understandable and to
prevent the same regression class.

## 1. Capability discovery is advisory

### Problem

The deployment policy documents `sys/capabilities-self` as optional, but the UI
currently requires a successful capability response before exposing write-only,
key metadata, and mount configuration actions. A token can therefore hold the
authoritative Vault permission while the UI makes the operation unreachable.

### Model

Action permission state becomes explicitly tri-state:

- **allowed:** the preflight confirms the required capability;
- **denied:** the preflight returns `deny` or omits the required capability;
- **unknown:** the preflight request itself is unavailable or forbidden.

Confirmed denial remains an authoritative UI gate. Unknown discovery never
becomes denial. The actual Vault operation remains authoritative in every state.

### KV behavior

- When data and metadata reads fail and write capability is unknown, the details
  state retains the scoped read errors and allows the user to enter guarded
  write-only mode.
- The write-only flow keeps its existing safe defaults: CAS 0 is the default,
  unconditional replacement requires an explicit strategy and acknowledgement,
  and Vault rejection is shown without claiming that discovery granted access.
- When metadata was read successfully but update capability is unknown, key
  metadata editing remains available. The update request decides authorization.
- When mount-config capability is unknown, Configure mount remains available.
  Opening the drawer performs the actual read; saving performs the actual update.
- Confirmed capability denial continues to hide or disable the corresponding
  action and avoids unnecessary endpoint calls.
- Permanent deletion keeps its current authoritative fallback behavior.

The UI must distinguish “preflight unavailable” from “permission denied” in its
copy and diagnostics. It must not promise that an unknown action will succeed.

### Verification

Unit tests cover all three permission states. Real-Vault and browser fixtures
must include a no-default-policy token with KV write permission and no
`sys/capabilities-self` grant.

## 2. Conflict-safe full-document editors

### Problem

Key metadata and mount configuration endpoints accept complete documents but do
not offer a client CAS field. A drawer held open while another operator updates
the same resource can submit a stale document and erase the concurrent change.

### Save protocol

Each drawer stores a normalized baseline from its initial successful read. Save
uses this protocol:

1. Validate the local draft.
2. Read a fresh resource snapshot immediately before mutation.
3. Normalize the fresh snapshot using the same supported-field representation as
   the baseline.
4. Compare fresh snapshot and baseline structurally.
5. If they match, submit the complete validated draft.
6. If they differ, do not update Vault. Preserve the local draft, show an
   accessible conflict alert, and offer an explicit **Load latest** action.

Loading latest replaces the form only after the user chooses it. There is no
silent overwrite, force-save, or automatic merge in 0.8.1. This closes the
observed stale-editor window but does not claim atomicity between the final read
and update because Vault provides no CAS primitive for these endpoints.

Closing remains disabled only while an actual request is in flight. Retry and
conflict states retain the target mount/path and never include secret values in
diagnostics.

### Verification

Component tests simulate a changed second read and assert that the mutation is
not called, the draft remains visible, and Load latest replaces it. Browser tests
exercise one metadata conflict and one mount-config conflict against a controlled
fixture.

## 3. Responsive editor rows

Metadata and structured write-only rows use a mobile-first grid:

- below the small breakpoint, the key occupies the full first row and the value
  plus 44 px remove control occupy the second row;
- at the small breakpoint and above, key, value, and a correctly sized remove
  track share one row;
- every flexible track uses `minmax(0, 1fr)`/`min-w-0` so long values cannot force
  the drawer wider than the viewport;
- destructive controls retain at least a 44 px touch target on narrow screens;
- focus indication, accessible names, and logical keyboard order are preserved.

The test matrix opens both affected drawers at 320, 360, 390, and 430 px and
asserts that the drawer and editor rows have no horizontal overflow. A zoom/reflow
test covers the 320 CSS-pixel equivalent of a desktop viewport at 400% zoom.

## 4. Explorer complexity boundaries

The release does not rewrite Explorer. It extracts only the orchestration units
needed by the corrections:

- selected-secret mutations and cache invalidation;
- destructive single-secret operations;
- the shared bulk-operation state machine;
- metadata and mount-config editor coordination.

Each extracted controller exposes a typed state/result interface and depends on
Vault gateways through existing application hooks. Presentational components do
not call Vault directly. Toasting, query invalidation, navigation, and dialog
state have one owner per operation rather than remaining duplicated inside
`ExplorerPage`.

The Explorer-specific lint command enforces cyclomatic complexity 20 and 200
source lines per function after extraction. Existing Access Center exceptions
are outside this gate. The main quality command includes the new gate so future
Explorer changes cannot silently reintroduce the removed hotspot.

## 5. Large JSON behavior

JSON validation is separated from every keystroke:

- ordinary documents use a 250 ms debounce before semantic `JSON.parse` work;
- stale validation results are ignored by an input revision identifier;
- documents above a 512 KiB UTF-8 soft threshold skip eager semantic parsing and
  show a non-blocking size warning;
- Review, Format, and Save always validate the current exact document;
- large-document validation runs outside the React render path, using a worker
  where supported and a deterministic deferred fallback in tests or unsupported
  environments;
- the editor never persists or logs document contents as part of diagnostics.

Documents above the threshold use a plain monospaced textarea without live syntax
highlighting to keep interaction responsive. The raw document remains editable
and no new server-side size limit is introduced.

Tests cover debounce cancellation, stale worker results, the large-document
warning, explicit final validation, and secret-value non-disclosure.

## 6. Type safety, dependency, and security ledger

TypeScript enables `strict`, `noUnusedLocals`, and `noUnusedParameters`. The few
existing incompatibilities are fixed without weakening individual files. ESLint
reenables the TypeScript unused-variable rule with conventional underscore ignore
patterns where a signature intentionally requires an unused argument.

React Router is updated to the patched 7.18.2 line. `SECURITY.md` records that the
previous RSC advisory was unreachable in the declarative client application and
is now removed by the dependency update. The full development-tree audit is
reviewed; every remaining advisory is either upgraded away or documented with
reachability, environment, owner, and review date. Automated audit checks use a
reviewed allowlist rather than `audit fix --force`.

## 7. CI and release verification

A repository CI workflow runs on pull requests and main-branch pushes:

1. deterministic `npm ci`;
2. strict type-check, lint, Explorer complexity, and unit/component tests;
3. production build and bundle budgets;
4. production dependency audit with the reviewed exception policy;
5. real-Vault integration matrix for Vault 1.21.3 and 2.0.3;
6. production-container Chromium E2E matrix for the same Vault versions.

The workflow uploads Playwright diagnostics only on failure and never prints
Vault tokens. Coverage is collected for the security-critical KV/session
application and domain directories with minimum thresholds of 80% for lines,
statements, and functions and 75% for branches; coverage is not fabricated
through broad exclusions.

Local scripts default to the same explicit Vault versions as CI rather than the
floating `1.20` tag. Environment overrides remain supported.

## 8. Container hardening

The final image runs Nginx as a non-root user while continuing to listen on 8080.
Runtime-generated files and CA extension use explicitly writable locations and
ownership; the compiled application and base configuration remain read-only.

The Compose service is compatible with:

- `read_only: true`;
- a minimal tmpfs for runtime scratch data;
- `no-new-privileges:true`;
- dropped Linux capabilities.

The runtime config and optional custom Vault CA remain supported. The healthcheck,
security headers, `/v1/` proxy contract, SPA fallback, and multi-architecture
image build are regression-tested. Base images stay pinned by digest.

## Failure handling and observability

All new failures use the existing normalized Vault error model and route-level
recovery boundary. Conflict, unknown preflight, validation, and authorization are
separate states. Diagnostics may contain endpoint scope and error category but
must not contain token values, secret documents, custom metadata values, or
clipboard contents.

## Acceptance criteria

The release is complete when:

- a write-only token without `sys/capabilities-self` can reach the guarded editor
  and successfully write when Vault authorizes it;
- confirmed denial still prevents the gated operation;
- concurrent metadata/config changes cannot be overwritten by a stale drawer;
- both new editors reflow without horizontal overflow at all target widths;
- Explorer orchestration is split behind typed controllers and the scoped
  complexity gate passes;
- strict TypeScript, unused checks, unit tests, build budgets, dependency audit,
  both Vault integration runs, and both production-container E2E runs pass;
- the image reports a non-root runtime user and passes its healthcheck under the
  hardened Compose settings;
- documentation matches the shipped dependency and deployment behavior;
- Access Center has no intentional product or data-flow changes.

## Rollout

The result is released as 0.8.1 after the full matrix passes. The multi-arch image
is tagged `0.8.1`; the immutable registry digest is recorded in repository docs.
The existing `0.8.0` tag remains available for rollback. No data migration or
Vault policy migration is required. Deployments may remove the optional
`sys/capabilities-self` grant after upgrading, although retaining it gives a more
precise UI preflight.
