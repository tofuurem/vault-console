# Vault upstream CA certificates

Place public PEM-encoded private CA certificates in this directory with a
`.crt` extension before starting Vault Console. Compose mounts the directory
read-only; the image adds the certificates to its runtime trust store before
Nginx starts.

Do not place Vault tokens, client private keys, unseal keys, or recovery keys
here.
