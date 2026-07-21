# Vault Console: existing Vault Compose deployment design

Date: 2026-07-22
Status: approved for specification review

## Goal

Ship Vault Console as a production-built container that joins the same Docker network as an already running self-hosted Vault Community instance. The browser must reach Vault through the console origin, while Vault remains owned, configured, initialized, unsealed, backed up, and upgraded outside this repository.

The deployment must not require mock data, a bundled development Vault, browser CORS configuration, or a frontend image rebuild when the internal Vault address changes.

## User-visible behavior

- `docker compose up -d --build` starts only Vault Console.
- The console joins an existing external Docker network named by `VAULT_DOCKER_NETWORK`.
- The container proxies `/v1/*` to the real Vault URL supplied in `VAULT_UPSTREAM`, such as `http://vault:8200`.
- The login form defaults to the console origin, so normal API requests stay same-origin and pass through the proxy.
- Token and `userpass` authentication, KV v2 operations, and access-control operations continue to use the real Vault HTTP API and Vault ACL decisions.
- Operators can still enter a different absolute Vault URL in the login form when they intentionally use a separate-origin deployment with CORS.

## Non-goals

- Starting, initializing, unsealing, or configuring the production Vault service.
- Storing a root token, operator token, user password, unseal key, or recovery key in Compose or environment files.
- Managing Vault storage, TLS certificates, audit devices, snapshots, or upgrades.
- Adding other secret engines or access-control CRUD beyond the current Phase 1 product scope.
- Preserving API interception as a browser end-to-end test strategy.

## Deployment architecture

```text
browser
  |
  | http(s)://console-host/
  | http(s)://console-host/v1/*
  v
vault-console container
  - Nginx serves the immutable React build
  - Nginx proxies /v1/* to VAULT_UPSTREAM
  |
  | external Docker network: VAULT_DOCKER_NETWORK
  v
existing Vault container:8200
```

The production Compose file declares one service, `vault-console`, and one external network. The network name is runtime configuration and is never created or deleted by this project. The existing Vault container must already be attached to that network and resolvable by the hostname used in `VAULT_UPSTREAM`.

The recommended initial values are:

```dotenv
VAULT_DOCKER_NETWORK=vault-network
VAULT_UPSTREAM=http://vault:8200
VAULT_CONSOLE_BIND=127.0.0.1
VAULT_CONSOLE_PORT=8080
```

Binding to loopback is the safe default. A production ingress or host reverse proxy can publish TLS and forward to the console port. Operators may explicitly use `0.0.0.0` when direct host exposure is intentional.

## Runtime configuration

The frontend image is built once. `VAULT_UPSTREAM` is substituted into an Nginx configuration when the container starts, not into JavaScript during the image build. This separates the browser-facing origin from the internal Docker address and permits moving Vault without rebuilding frontend assets.

When `VITE_VAULT_ADDR` is not supplied for a local developer build, the application defaults to `window.location.origin`. Local development may still set `VITE_VAULT_ADDR` in `.env.local` to call a separate Vault directly.

Nginx forwards the original `/v1/` path, uses the upstream host for Vault routing, disables proxy buffering for API responses, and never injects `X-Vault-Token`. The token continues to travel only from browser memory to Vault for the lifetime of the request.

The container exposes a local `/healthz` endpoint that reports only Nginx/UI readiness. Vault readiness remains observable through proxied `/v1/sys/health`; its non-2xx sealed or standby status codes must not make the static UI container unhealthy.

## Upstream TLS

Both `http://vault:8200` and `https://vault:8200` upstreams are supported. HTTPS uses SNI and certificate verification against the container trust store. An installation with a private CA can mount its public CA certificate at the documented read-only path so the entrypoint can add it to the runtime trust bundle.

Disabling TLS verification is intentionally unsupported. A same-network plaintext upstream is acceptable only when that matches the operator's Docker-network threat model and TLS terminates at a trusted outer proxy.

## Removal of mock structures

Production code already creates the real Vault adapters by default. The cleanup makes that boundary explicit:

- remove `src/mocks`;
- move reusable unit-test sample objects under `src/test/fixtures` and name them as fixtures, not mocks;
- remove Playwright request interception and its mock API state;
- run browser smoke coverage against a disposable real Vault Community container prepared only by the test harness;
- keep failure/retry edge cases in deterministic unit and component tests, where test doubles remain local to each test and never enter the production bundle.

No production module may import from `src/test`, `e2e`, or integration-test support.

## Compose lifecycle and failure handling

Compose validates that `VAULT_UPSTREAM` and `VAULT_DOCKER_NETWORK` are set. Startup fails visibly if the Nginx configuration cannot be rendered. If Vault is absent, sealed, uninitialized, or unreachable, the static UI remains available and the login screen shows the real health error returned by the existing client behavior.

The Compose project does not use `depends_on`, because the external Vault is not one of its services. Restart policy applies only to Vault Console. Stopping or removing this Compose project must not affect the external network or Vault container.

## Security constraints

- No Vault credentials in Docker build args, Compose environment, health checks, URLs, generated JavaScript, or Nginx configuration.
- The external Docker network is treated as operator-managed infrastructure.
- The image continues to send restrictive browser headers and does not load assets from external CDNs.
- Nginx logs do not include request headers or bodies.
- The proxy does not broaden Vault permissions; all authorization remains enforced by Vault policies and capabilities.
- Private CA material is public trust material, mounted read-only, and never confused with a Vault client key.

## Verification strategy

1. Static verification: Compose interpolation/config validation, TypeScript, ESLint, Vitest, and production build.
2. Image verification: build the production image and confirm `/healthz`, `/`, and an SPA route.
3. Real-Vault proxy verification: start a disposable Vault Community container on a temporary external Docker network, then start the production Compose service with that network and `VAULT_UPSTREAM`.
4. Browser verification: authenticate through the console origin with a temporary token, browse and mutate seeded KV v2 data, and complete the supported happy-path user creation against real Vault.
5. Isolation verification: stop the console project and confirm the separately managed Vault container/network remain present until the test harness explicitly removes its own temporary resources.

The disposable Vault exists only in tests and is not added to production `compose.yml`.

## Documentation and operator handoff

The README will document:

- attaching both containers to the same external network;
- required `.env` variables and an example using the hostname `vault`;
- Compose build/start/stop/log commands;
- TLS termination and private-CA setup;
- the required Vault KV v2, `userpass`, identity, and operator-policy prerequisites;
- why no Vault token belongs in `.env`;
- troubleshooting for Docker DNS, sealed Vault, TLS trust, and direct-origin CORS.

## Acceptance criteria

- `compose.yml` contains no Vault service and joins a declared external network.
- Changing `VAULT_UPSTREAM` requires only a container restart, not an image rebuild.
- A browser can authenticate and use KV v2 through the console origin against a real Vault on the same Docker network.
- No `src/mocks` directory or Playwright Vault API interception remains.
- Production assets contain no fixture credentials or fixture catalog labels.
- Unit, integration, real-Vault browser, build, image, and Compose checks pass.
- Project documentation accurately distinguishes production deployment from disposable test infrastructure.
