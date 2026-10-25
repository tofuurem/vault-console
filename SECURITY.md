# Security notes

## Runtime model

Vault Console is a browser-only Vite application served by a small Nginx
container. It uses React Router in declarative `<BrowserRouter>` mode and sends
Vault API requests through the same-origin `/v1/*` reverse proxy. It does not
run React Server Components, React Router framework actions, server loaders, or
an application backend.

Credentials must never be committed, placed in environment variables, or
forwarded by the reverse proxy. Vault remains the source of authorization.
See [USAGE.md](USAGE.md) for the deployment and storage model.

The current token is retained in tab-scoped `sessionStorage`. Copy token calls
the sensitive-value reveal function only inside the clipboard action; the raw
token is not placed in React state, markup, toast text, diagnostics, or proxy
logs. Sign out only clears local session state. Revoke token calls Vault
`auth/token/revoke-self` and can also revoke child tokens, leases, and dynamic
secrets created by the calling token.

## Unseal key shares

Reviewed: 2026-10-25

The `/unseal` page talks to the unauthenticated `sys/seal-status` and
`sys/unseal` endpoints through the same-origin `/v1/*` proxy and never attaches
a Vault token. The key share input is uncontrolled and marked to be ignored by
password managers. Its value is read once on submit, wrapped in a memory-only
sensitive value for the single request, and cleared from the field before the
request completes. Shares are never placed in React state, browser storage,
URLs, history state, toasts, or diagnostics, and Vault error bodies are not
surfaced. A 400 response is classified by re-reading seal status rather than by
echoing Vault's message. Initialization is intentionally unsupported because it
returns a root token. Enter key shares only over HTTPS on a trusted device.

A structured `Vault is sealed` marker on any response is classified as a sealed
error so the authenticated workspace can direct operators to the unseal page.

## Response wrapping (Share once)

Reviewed: 2026-10-25

Share once reads the selected KV v2 version with `X-Vault-Wrap-TTL` and keeps
only `wrap_info`; the console never parses the secret data of that response.
The wrapping token is a memory-only sensitive value shown once in the dialog
and dropped when it closes. It is never placed in a URL, storage, history
state, or diagnostics. The public `/unwrap` page keeps the pasted token in a
ref, looks it up with `sys/wrapping/lookup` (token in the body, no session),
and unwraps only after an explicit second action. Unwrapped values stay masked
until revealed and are not persisted.

## Activity log reader

Reviewed: 2026-10-25

The optional `vault-console-audit` service reads a Vault file audit device log
read-only and returns metadata only: time, request id, operation, path, mount,
display name, entity id, policies, remote address, outcome, and Vault's error
string. It never decodes or returns request or response bodies, so even
Vault's HMAC values do not leave the file. Every request must carry the
operator's Vault token; the service asks `sys/capabilities-self` for `sys/audit`
and serves only tokens with `sudo` and `read` (or `root`). Decisions are cached
for 30 seconds by SHA-256 of the token; the raw token is not stored or logged.
Responses are `no-store`, and Nginx does not access-log `/audit-api/`. Each search
scans at most 256 MiB of the newest part of the file.

## Vault response and proxy metadata

Reviewed: 2026-07-27

Vault returns HTTP 403 for both policy denial and invalid, expired, or revoked
tokens. Vault Console treats a 403 as session expiry only when the structured
Vault `errors` array contains the exact `invalid token` marker. Arbitrary
upstream error text is not retained or exposed. A generic 403 remains an
authorization result so that valid no-default and least-privilege tokens can
continue to use their permitted paths.

Vault KV v2 reports check-and-set mismatches as HTTP 400. Vault Console only
reclassifies the exact structured `check-and-set parameter did not match the
current version` marker as a conflict and never retains the upstream error
body. Other HTTP 400 responses remain invalid requests.

Vault path segments are validated before URL construction. Dot segments,
controls, and ambiguous empty segments are rejected without echoing the path in
the error. The default Nginx `/v1/*` proxy location has access logging disabled
because mount names, logical secret paths, and usernames are sensitive
metadata. Use a Vault audit device for the authoritative operation trail.

## Destructive and write-only KV operations

Reviewed: 2026-08-27

Soft-delete latest, explicit version delete, version destroy, and metadata
delete are separate operations with separate Vault endpoints and capabilities.
Deleting metadata permanently removes the key, all versions, custom metadata,
and history. Permanent single and bulk actions require typed confirmation;
bulk execution has an exact-path preflight and bounded concurrency.

Write-only editing never pretends to preserve unread fields. It sends a full
replacement document and defaults to create-only CAS 0 when metadata is not
readable. Unconditional replacement requires a separate strategy choice and a
second acknowledgement. When capability discovery itself is unavailable, the
UI may expose a guarded attempt but never treats it as permission; the direct
Vault response remains authoritative.

Metadata and mount-configuration editors normalize their initial snapshot and
read it again immediately before saving the complete supported settings. A
changed snapshot blocks the mutation, preserves the local draft, and requires
an explicit Load latest action. Vault exposes no CAS primitive for these
configuration endpoints, so the final read/update pair cannot be fully atomic.

## Dependency audit policy

Reviewed: 2026-08-29

Both the production and complete dependency trees are required to pass at the
moderate audit level. Run `npm run audit:production` and `npm run audit`; CI runs
the same commands from the committed lockfile.

The 0.8.1 dependency refresh resolves the previous React Router RSC advisory by
pinning `react-router-dom` and `react-router` to 7.18.2. It also resolves the
development-tree `brace-expansion`, `js-yaml`, `nanoid`, `postcss`, and `undici`
advisories with compatible patched versions. There are no accepted advisory
exceptions for this release.

Do not suppress or force past a new advisory. If a future advisory cannot be
fixed immediately, document its identifier, dependency path, production
reachability, owner, and next review date here, then add a deterministic audit
policy that fails when the reviewed advisory set changes.
