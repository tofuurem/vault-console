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

Reviewed: 2026-07-25

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
