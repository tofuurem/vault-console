# Vault Console 0.2.0 registry release

Date: 2026-07-23
Status: published

## Artifact contract

- Repository: `zero-noise-registry.registry.twcstorage.ru/vault-console`
- Release tag: `0.2.0`
- Convenience tag: `latest`
- Platforms: `linux/amd64` and `linux/arm64`
- Runtime port: `8080`
- Required runtime environment: `VAULT_UPSTREAM=http://vault:8200`

This release contains the full-screen nested-secret workspace and the
Access-control-to-KV navigation fix from the cleaned GitHub `main` branch.

## Corrective publication

An operator-published `0.2.0` index existed before this release but contained
only a `linux/arm64` application manifest. It could not be installed or started
on the target `linux/amd64` server. The user explicitly requested replacing the
same `0.2.0` and `latest` tags with a verified multi-platform index.

The corrective build must:

1. Build from the committed and secret-scanned source tree.
2. Publish native `linux/amd64` and `linux/arm64` application manifests.
3. Point `0.2.0` and `latest` at the same OCI index.
4. Verify both platform manifests through registry inspection.
5. Pull and run the `linux/amd64` release and check `/healthz`.

No Vault token, password, unseal key, private CA, or registry credential is
passed as a build argument or stored in an image layer.

## Release result

Published on 2026-07-23 from source revision
`f3017f6aaef52f2c07b973ff9f6b5507713680b0`.

- Replaced arm64-only index:
  `sha256:2e1b4269f2ecc3555e48ba0ff0a7e490a90b44d72ae7f5994e8c5c6d152aee0d`.
- OCI index:
  `sha256:dbd16307fca1ff6bbf69fb1f8901ad3709b4fb27c584d6695607dbb68ed0a1c7`.
- `linux/amd64`:
  `sha256:e0476d59a9d54f3df3bb03f3ac718fb58de5fabbbb74188edc570acabd415f31`.
- `linux/arm64`:
  `sha256:2a3f1775bf852ae7d17f889df4e1868876254aa5b2713020c4ded28d61bbdbdf`.
- `0.2.0` and `latest` resolve to the same OCI index.
- A direct pull and runtime smoke test of the amd64 child manifest returned
  `ok` from `/healthz`.
