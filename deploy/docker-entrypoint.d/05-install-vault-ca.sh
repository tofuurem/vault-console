#!/bin/sh
set -eu

certificate_dir=/etc/vault-console/ca-certificates
installed=false

if [ -d "$certificate_dir" ]; then
    for certificate in "$certificate_dir"/*.crt; do
        [ -f "$certificate" ] || continue
        cp "$certificate" "/usr/local/share/ca-certificates/vault-console-$(basename "$certificate")"
        installed=true
    done
fi

if [ "$installed" = true ]; then
    update-ca-certificates >/dev/null
fi
