#!/bin/sh
set -eu

runtime_dir=/tmp/vault-console
certificate_dir=/etc/vault-console/ca-certificates
system_ca_bundle=/etc/ssl/certs/ca-certificates.crt
runtime_ca_bundle="${runtime_dir}/ca-certificates.crt"

fail() {
  echo "Vault Console container configuration is invalid: $1" >&2
  exit 1
}

normalize_boolean() {
  case "$1" in
    true|false) printf '%s' "$1" ;;
    *) fail "runtime UI booleans must be true or false" ;;
  esac
}

VAULT_UPSTREAM="${VAULT_UPSTREAM:?VAULT_UPSTREAM is required}"
VAULT_UPSTREAM="${VAULT_UPSTREAM%/}"
case "${VAULT_UPSTREAM}" in
  http://*|https://*) ;;
  *) fail "VAULT_UPSTREAM must be an HTTP or HTTPS origin" ;;
esac
case "${VAULT_UPSTREAM}" in
  *[!A-Za-z0-9._:/-]*) fail "VAULT_UPSTREAM contains unsupported characters" ;;
esac
upstream_authority="${VAULT_UPSTREAM#*://}"
case "${upstream_authority}" in
  ""|*/*) fail "VAULT_UPSTREAM must not contain a path" ;;
esac

VAULT_UI_ALLOW_CUSTOM_ADDRESS="$(normalize_boolean "${VAULT_UI_ALLOW_CUSTOM_ADDRESS:-false}")"
VAULT_UI_ALLOW_CUSTOM_USERPASS_MOUNT="$(normalize_boolean "${VAULT_UI_ALLOW_CUSTOM_USERPASS_MOUNT:-false}")"
VAULT_UI_USERPASS_MOUNT="${VAULT_UI_USERPASS_MOUNT:-userpass}"
VAULT_UI_USERPASS_MOUNT="${VAULT_UI_USERPASS_MOUNT#/}"
VAULT_UI_USERPASS_MOUNT="${VAULT_UI_USERPASS_MOUNT%/}"
case "${VAULT_UI_USERPASS_MOUNT}" in
  ""|*".."*|*[!A-Za-z0-9._/-]*) fail "VAULT_UI_USERPASS_MOUNT is not a valid Vault path" ;;
esac

umask 022
mkdir -p \
  "${runtime_dir}/client-temp" \
  "${runtime_dir}/proxy-temp" \
  "${runtime_dir}/fastcgi-temp" \
  "${runtime_dir}/uwsgi-temp" \
  "${runtime_dir}/scgi-temp"
cp "${system_ca_bundle}" "${runtime_ca_bundle}"
if [ -d "${certificate_dir}" ]; then
  for certificate in "${certificate_dir}"/*.crt; do
    [ -f "${certificate}" ] || continue
    printf '\n' >> "${runtime_ca_bundle}"
    cat "${certificate}" >> "${runtime_ca_bundle}"
    printf '\n' >> "${runtime_ca_bundle}"
  done
fi

export VAULT_UPSTREAM
export VAULT_UI_ALLOW_CUSTOM_ADDRESS
export VAULT_UI_ALLOW_CUSTOM_USERPASS_MOUNT
export VAULT_UI_USERPASS_MOUNT

envsubst \
  '${VAULT_UPSTREAM}' \
  < /etc/vault-console/server.conf.template \
  > "${runtime_dir}/server.conf"
envsubst \
  '${VAULT_UI_ALLOW_CUSTOM_ADDRESS} ${VAULT_UI_USERPASS_MOUNT} ${VAULT_UI_ALLOW_CUSTOM_USERPASS_MOUNT}' \
  < /etc/vault-console/runtime-config.js.template \
  > "${runtime_dir}/runtime-config.js"

nginx -t -c /etc/vault-console/nginx.conf
exec "$@"
