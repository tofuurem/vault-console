# Vault Console 0.2.0 registry release

Date: 2026-07-23
Status: prepared

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

Pending publication.
