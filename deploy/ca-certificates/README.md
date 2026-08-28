# Vault upstream CA certificates

Place public PEM-encoded private CA certificates in this directory with a
`.crt` extension before starting Vault Console. Compose mounts the directory
read-only. The non-root entrypoint appends them to an ephemeral CA bundle under
`/tmp/vault-console` before Nginx starts; it never modifies the image trust
store.

Do not place Vault tokens, client private keys, unseal keys, or recovery keys
here.
