# Existing Vault Compose Implementation Plan

Date: 2026-07-22
Design: `docs/superpowers/specs/2026-07-22-vault-console-existing-vault-compose-design.md`
Starting branch: `main`
Starting design commit: `13083a8`

## Goal

Package Vault Console as a runtime-configurable production container that joins
the existing external `caddy_net` Docker network and proxies browser requests to
an operator-managed Vault. Remove mock-named source structures and verify the
browser workflow against a disposable real Vault rather than intercepted HTTP.

## User-visible outcome

- `docker compose up -d --build` starts only Vault Console.
- The default external network is `caddy_net`; operators can override its name.
- `VAULT_UPSTREAM` changes take effect after container recreation without a
  frontend image rebuild.
- The login form defaults to the console origin and `/v1/*` is proxied to the
  existing Vault container.
- Production source and browser tests contain no mock Vault catalog or mock API.

## Non-goals and compatibility

- Compose does not own the Vault container or Docker network lifecycle.
- No Vault token, password, unseal key, or recovery key enters Docker config.
- Existing direct-to-Vault deployments remain possible by entering an absolute
  URL and configuring Vault CORS.
- No data migration or public JavaScript API change is required.

## Phase 1: Runtime same-origin deployment

Phase base: `13083a8`

### Task 1.1: Default the browser client to its own origin

Expected files:

- `src/pages/login/page.tsx`
- `src/pages/login/LoginPage.test.tsx`

Acceptance criteria:

- An absent `VITE_VAULT_ADDR` resolves to `window.location.origin`.
- An explicitly built developer address remains supported.
- A component test protects the same-origin default.

Verification:

```sh
npm run test:run -- LoginPage
npm run type-check
```

### Task 1.2: Make the image proxy runtime-configurable

Expected files:

- `Dockerfile`
- `deploy/nginx.runtime.conf.template`
- `deploy/docker-entrypoint.d/05-install-vault-ca.sh`
- `deploy/ca-certificates/.gitignore`
- `deploy/ca-certificates/README.md`

Acceptance criteria:

- The React build is immutable and contains no internal Vault hostname.
- Nginx renders `VAULT_UPSTREAM` at container start and preserves `/v1/*`.
- `/healthz` reports UI readiness without depending on Vault seal state.
- HTTPS upstream verification is enabled; optional private CA files are added to
  the trust store before Nginx starts.
- Nginx never injects a Vault token.

Verification:

```sh
docker build -t vault-console:compose-check .
docker run --rm -e VAULT_UPSTREAM=http://vault:8200 vault-console:compose-check nginx -t
```

### Task 1.3: Add production Compose and runtime examples

Expected files:

- `compose.yml`
- `.env.example`
- `.dockerignore`

Acceptance criteria:

- Compose contains one application service and one external network.
- The external network defaults to `caddy_net`.
- `VAULT_UPSTREAM` is required, while bind address and port have safe defaults.
- The image has a container health check and restart policy.
- No secret-bearing variable exists.

Verification:

```sh
VAULT_UPSTREAM=http://vault:8200 docker compose config --quiet
VAULT_UPSTREAM=http://vault:8200 docker compose config
```

Phase-level verification:

```sh
npm run quality
npm run build
VAULT_UPSTREAM=http://vault:8200 docker compose config --quiet
docker build -t vault-console:compose-check .
git diff --check
```

Intended phase commit:

```text
feat: add existing Vault Compose deployment
```

## Phase 2: Real-Vault browser coverage and fixture cleanup

### Task 2.1: Remove mock-named source structures

Expected files:

- remove `src/mocks/vault-access-catalog.ts`
- add `src/test/fixtures/create-user-access-catalog.ts`
- affected unit/component tests

Acceptance criteria:

- No `src/mocks` directory remains.
- Test sample data is named and imported as a fixture.
- Production modules do not import test support.

Verification:

```sh
test ! -d src/mocks
rg -n "@/mocks|mockCreateUserAccessCatalog" src || true
npm run test:run -- AccessScreen AccessSourcePicker AccessSummary EffectivePermissionTree CreateUser UserProfile
```

### Task 2.2: Replace intercepted Playwright API with a real Vault harness

Expected files:

- remove `e2e/vault-api.ts`
- update `e2e/vault-console.spec.ts`
- update `playwright.config.ts`
- add `scripts/test-compose-e2e.sh`
- update `package.json`

Acceptance criteria:

- The harness creates a temporary external Docker network and disposable Vault,
  then runs the production Compose service against it.
- The production Compose file remains Vault-free.
- Playwright authenticates through the console origin, reads seeded KV v2 data,
  verifies narrow layout, and creates a real `userpass` identity-backed user.
- Cleanup removes only resources named by the test harness.
- Retry/rollback failure paths remain covered by deterministic unit/component
  tests rather than production-like HTTP interception.

Verification:

```sh
npm run test:e2e
rg -n "page\.route|mockVaultApi|MockVaultState" e2e scripts || true
```

Phase-level verification:

```sh
npm run quality
npm run test:vault
npm run test:e2e
git diff --check
```

Intended phase commit:

```text
test: verify Compose against real Vault
```

## Phase 3: Operator documentation and stabilization

### Task 3.1: Document the existing-network deployment

Expected files:

- `README.md`
- design/plan status notes when needed

Acceptance criteria:

- Commands use `caddy_net` and an existing Vault hostname such as `vault`.
- Network attachment, environment, TLS/private CA, lifecycle, and troubleshooting
  are explicit.
- Documentation states that production Compose never starts or removes Vault.
- Direct-origin CORS remains documented as an alternative.

Verification:

```sh
rg -n "caddy_net|VAULT_UPSTREAM|docker compose|private CA|CORS" README.md
git diff --check
```

### Task 3.2: Run final release checks

Acceptance criteria:

- Typecheck, lint, unit/component tests, production build, disposable Vault API
  integration, Compose real-Vault browser flow, and Docker image checks pass.
- No mock-named directory or intercepted Vault endpoint remains.
- Git contains one final commit per implementation phase after the design and
  plan commits.

Verification:

```sh
npm run quality
npm run build
npm run test:vault
npm run test:e2e
VAULT_UPSTREAM=http://vault:8200 docker compose config --quiet
rg -n "@/mocks|mockVaultApi|MockVaultState|page\.route" src e2e scripts || true
git diff --check
git status --short
```

Intended phase commit:

```text
docs: document existing Vault deployment
```
