#!/bin/sh
set -eu

normalize_boolean() {
  case "$1" in
    true|false) printf '%s' "$1" ;;
    *)
      echo "Runtime UI boolean must be true or false, got: $1" >&2
      exit 1
      ;;
  esac
}

VAULT_UI_ALLOW_CUSTOM_ADDRESS="$(normalize_boolean "${VAULT_UI_ALLOW_CUSTOM_ADDRESS:-false}")"
VAULT_UI_ALLOW_CUSTOM_USERPASS_MOUNT="$(normalize_boolean "${VAULT_UI_ALLOW_CUSTOM_USERPASS_MOUNT:-false}")"
VAULT_UI_USERPASS_MOUNT="${VAULT_UI_USERPASS_MOUNT:-userpass}"
VAULT_UI_USERPASS_MOUNT="${VAULT_UI_USERPASS_MOUNT#/}"
VAULT_UI_USERPASS_MOUNT="${VAULT_UI_USERPASS_MOUNT%/}"

case "${VAULT_UI_USERPASS_MOUNT}" in
  ""|*".."*|*[!A-Za-z0-9._/-]*)
    echo "VAULT_UI_USERPASS_MOUNT must be a non-empty Vault path using A-Z, a-z, 0-9, dot, underscore, slash, or hyphen." >&2
    exit 1
    ;;
esac

export VAULT_UI_ALLOW_CUSTOM_ADDRESS
export VAULT_UI_ALLOW_CUSTOM_USERPASS_MOUNT
export VAULT_UI_USERPASS_MOUNT

envsubst \
  '${VAULT_UI_ALLOW_CUSTOM_ADDRESS} ${VAULT_UI_USERPASS_MOUNT} ${VAULT_UI_ALLOW_CUSTOM_USERPASS_MOUNT}' \
  < /etc/vault-console/runtime-config.js.template \
  > /usr/share/nginx/html/runtime-config.js
