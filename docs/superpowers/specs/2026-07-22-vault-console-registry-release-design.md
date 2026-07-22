# Vault Console registry release design

Date: 2026-07-22
Status: published

## Goal

Publish the verified Vault Console production image to the user's private TWC
container registry so the combined Vault Compose deployment can pull a stable,
prebuilt artifact without access to this source repository.

## Artifact contract

- Repository: `zero-noise-registry.registry.twcstorage.ru/vault-console`
- Immutable release tag: `0.1.0`
- Convenience tag: `latest`
- Platforms: `linux/amd64` and `linux/arm64`
- Source branch: `main`
- Source commit before release: `eaf590c`
- Runtime port: `8080`
- Required runtime environment: `VAULT_UPSTREAM=http://vault:8200`

Both requested tags are currently absent from the registry. `0.1.0` must not be
overwritten after this publication. Future builds use a new semantic version;
`latest` may move to that new verified version.

## Build and publication

The existing multi-stage `Dockerfile` remains the artifact definition. Buildx
publishes one OCI image index containing native `amd64` and `arm64` manifests.
The frontend assets are built once per target platform from the committed npm
lockfile, then served by the runtime-configurable Nginx stage.

No Vault token, registry password, unseal key, upstream address, or private CA
is embedded in build arguments or image layers. Registry authentication comes
only from the operator's existing Docker credential store.

## Verification gates

Before publication:

1. Git worktree is clean and HEAD matches the recorded source commit plus this
   release specification commit.
2. TypeScript, ESLint, Vitest, and the production Vite build pass.
3. The existing disposable Vault integration and real-Vault Compose browser
   test pass.

After publication:

1. Registry inspection reports one OCI index for `0.1.0` and `latest`.
2. Both tags resolve to the same index digest.
3. The index contains `linux/amd64` and `linux/arm64` application manifests.
4. A clean pull of `0.1.0` succeeds.
5. The pulled image starts with a non-secret local `VAULT_UPSTREAM` and returns
   HTTP 200 from `/healthz`.

## Failure handling

- Authentication or registry errors stop the release without changing source.
- A partial multi-platform push is not declared successful until the final OCI
  index can be inspected.
- If `0.1.0` appears before push with an unexpected digest, publication stops
  instead of overwriting it.
- Temporary verification containers and images created by this release are
  removed after the checks.

## Deployment reference

The combined Compose service uses the immutable tag:

```yaml
vault-console:
  image: zero-noise-registry.registry.twcstorage.ru/vault-console:0.1.0
  environment:
    VAULT_UPSTREAM: http://vault:8200
```

`latest` is available for convenience, but production Compose should remain
pinned to `0.1.0` until the next explicitly selected release.

## Release result

Published on 2026-07-22 from source revision
`6e40f453a8f579750f9d76149cd08b7411915f03`.

- OCI index: `sha256:d162ba90ac181c58415271b54785929211445e5908fe3ff4981f8db29a196520`
- `linux/amd64`: `sha256:1ea4984dc5c4beeb8a07120c09fb518c159f44684728e8f2b02af1593b0dfb3b`
- `linux/arm64`: `sha256:46bbb67c7b1a6fa0659b478e75586fee0ac429b1caf6eb62ecf079517054f8d6`
- Tags: `0.1.0` and `latest` resolve to the same OCI index.
- Pull and runtime smoke checks passed for `0.1.0`.
