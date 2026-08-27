# Native Vault UI compatibility and 0.7.1 release

## Context

Vault Console and HashiCorp Vault's native UI are served from the same origin.
The native UI treats every `localStorage` key beginning with `vault-` as a
serialized Vault token record and parses its value as JSON. Vault Console uses
keys beginning with `vault-console`; its theme value is a plain string. As a
result, visiting `/ui/` after using Vault Console can abort native UI startup
with a `JSON.parse` error and leave a blank page.

The native UI also calls operator endpoints that are outside Vault Console's
current example admin policy. In particular, the native administration view
cannot read `sys/config/state/sanitized`. Authentication sessions must remain
separate: Vault Console stores its token in tab-scoped `sessionStorage`, and no
token may be copied into the native UI's storage.

## Goals

- Prevent Vault Console from creating `localStorage` keys in Vault's reserved
  `vault-` namespace.
- Preserve existing non-secret preferences and persistent favorites when a
  user next opens Vault Console.
- Remove migrated legacy keys so the native UI can start normally afterward.
- Keep Vault Console and native Vault UI authentication isolated.
- Document and provide a reverse-proxy layout in which both interfaces and the
  Vault API are routed explicitly.
- Release and publish version `0.7.1` as a multi-architecture container image.

## Non-goals

- Sharing or migrating authentication tokens between the two interfaces.
- Changing Vault's native UI code or suppressing legitimate authorization
  failures for non-administrative tokens.
- Automatically deleting arbitrary keys in the `vault-` namespace.
- Changing the public root route of Vault Console.

## Considered approaches

### Safe Vault Console namespace with targeted migration (selected)

Rename Vault Console's persistent keys to a namespace that does not begin with
`vault-`, then migrate only the application's known legacy keys. This fixes the
root cause, retains preferences, and does not touch native Vault records.

### Store every legacy value as JSON

Serializing the theme string as JSON would stop the immediate parse exception,
but native Vault would still scan unrelated Vault Console records as potential
tokens. This leaves a fragile namespace collision and is rejected.

### Put the native UI on another origin

A dedicated hostname provides complete browser-storage isolation, but requires
DNS, TLS, and deployment changes outside this repository. It remains a valid
infrastructure hardening option but is not required for the application fix.

## Storage design

Only persistent `localStorage` keys that currently overlap Vault's namespace
will move:

| Data | Legacy key | New key |
| --- | --- | --- |
| Theme | `vault-console:theme` | `vc-console:theme` |
| Workspace preferences | `vault-console:workspace-preferences:v1` | `vc-console:workspace-preferences:v1` |
| Inspector layout | `vault-console:inspector-layout:v1` | `vc-console:inspector-layout:v1` |
| Persistent favorites | `vault-console.navigation.favorites.v1.<scope>` | `vc-console.navigation.favorites.v1.<scope>` |

Session keys remain unchanged because the native UI scans `localStorage`, not
`sessionStorage`. This avoids modifying the tab-scoped Vault Console token and
recent-path lifecycle in a patch release.

A small storage migration module will run before React providers read browser
preferences. It will:

1. Access `localStorage` defensively.
2. Migrate the three known exact keys and keys under the known persistent
   favorites prefix.
3. Prefer an existing value under the new key when both versions exist.
4. Remove a legacy key only after the new value is present or successfully
   written.
5. Ignore storage access, quota, and removal failures without blocking startup.
6. Never enumerate, parse, copy, or remove unrelated native `vault-*` keys.

Migration is idempotent. Existing users must open Vault Console `/` once after
deployment for the browser-local migration to run; no server-side release can
rewrite a client's browser storage while only `/ui/` is loaded.

## Vault policy and proxy documentation

The high-privilege example admin policy will add read access to
`sys/config/state/sanitized`, with a comment explaining that it is required for
the native UI's sanitized configuration view and should be omitted from roles
that do not need operator visibility.

The project Caddy example and usage guide will show ordered routing:

1. `/ui` and `/ui/*` directly to Vault.
2. `/v1` and `/v1/*` directly to Vault.
3. All remaining routes to Vault Console.

The documentation will state that the two interfaces intentionally keep
separate browser sessions. A successful Vault Console login does not
authenticate the native UI.

## Tests and validation

Unit tests will cover:

- exact-key and dynamic-prefix migration;
- preservation when a new value already exists;
- idempotence;
- isolation from unrelated `vault-*` keys;
- graceful behavior when browser storage operations fail;
- all Vault Console `localStorage` constants avoiding the `vault-` prefix.

Existing preference, navigation, session, and application tests will be
updated only where their expected keys change. Validation will run targeted
tests first, followed by `npm run quality`, `npm run build`, Vault integration
tests, and the real-Vault Compose E2E suite when the local Docker environment is
available.

## Release

The source version will be bumped from `0.7.0` to `0.7.1`. After validation,
the release will be committed, tagged `v0.7.1`, and pushed to `origin`. A
multi-architecture image for `linux/amd64` and `linux/arm64` will be published
as:

`zero-noise-registry.registry.twcstorage.ru/vault-console:0.7.1`

The published manifest digest will be inspected and reported. If publication
succeeds, the digest will be recorded in project documentation in the same
follow-up style used for the `0.5.0` release.

## Acceptance criteria

- After Vault Console migration runs, native `/ui/` no longer encounters a
  non-JSON `vault-console:*` record.
- Vault Console retains migrated theme, workspace, Inspector, and favorite
  preferences.
- No authentication token is moved to `localStorage` or shared with native
  Vault UI.
- The admin policy and dual-UI Caddy example are documented accurately.
- All required checks pass.
- Git tag `v0.7.1` and the multi-architecture registry image are published, or
  an external authentication/platform blocker is reported explicitly.
