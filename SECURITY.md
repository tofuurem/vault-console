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

## Reviewed dependency advisories

### GHSA-qwww-vcr4-c8h2 — not reachable

Reviewed: 2026-07-26

`npm audit --omit=dev` reports the React Router advisory
[GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2)
for the currently resolved React Router 7 release. The upstream advisory states
that it affects applications only when they use the unstable RSC APIs.

Vault Console uses declarative `<BrowserRouter>` exclusively and contains no
unstable RSC API, React Server Component, or React Router server action path.
The vulnerable flow is therefore not reachable in this application. The
advisory is retained here instead of being silently suppressed. Reassess this
exception whenever React Router is upgraded or the routing architecture
changes.

The review was repeated against resolved `react-router-dom@7.18.1` and
`react-router@7.18.1`. `npm audit fix --omit=dev --dry-run` did not propose a
production dependency version that removes the advisory; it only pruned
development dependencies for the omitted install. Do not treat that command as
a remediation. Track the upstream range and upgrade once a fixed declarative
router release is available.

### GHSA-mh99-v99m-4gvg — build tooling only

Reviewed: 2026-07-26

The full development-tree audit reports the `brace-expansion` denial-of-service
advisory through ESLint and TypeScript ESLint glob matching. It is absent from
`npm audit --omit=dev` and from the final Nginx image, which contains only the
compiled static application. The repository invokes ESLint with the fixed
trusted path `src`; no Vault response or browser input can control its glob
patterns.

`npm audit fix --force` currently proposes the breaking ESLint 10 upgrade.
Keep this advisory visible and upgrade the lint toolchain in a separately
validated maintenance change rather than forcing a major dependency rewrite
inside a release build.
