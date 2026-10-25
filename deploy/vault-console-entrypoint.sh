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

VAULT_UI_ENVIRONMENT_NAME="${VAULT_UI_ENVIRONMENT_NAME:-}"
case "${VAULT_UI_ENVIRONMENT_NAME}" in
  *[!A-Za-z0-9._\ -]*) fail "VAULT_UI_ENVIRONMENT_NAME may contain only letters, digits, spaces, dots, underscores, and hyphens" ;;
esac
if [ "${#VAULT_UI_ENVIRONMENT_NAME}" -gt 24 ]; then
  fail "VAULT_UI_ENVIRONMENT_NAME must be at most 24 characters"
fi
VAULT_UI_ENVIRONMENT_TONE="${VAULT_UI_ENVIRONMENT_TONE:-neutral}"
case "${VAULT_UI_ENVIRONMENT_TONE}" in
  neutral|info|warning|danger) ;;
  *) fail "VAULT_UI_ENVIRONMENT_TONE must be neutral, info, warning, or danger" ;;
esac

VAULT_CONSOLE_AUDIT_UPSTREAM="${VAULT_CONSOLE_AUDIT_UPSTREAM:-}"
VAULT_CONSOLE_AUDIT_UPSTREAM="${VAULT_CONSOLE_AUDIT_UPSTREAM%/}"
VAULT_UI_AUDIT_AVAILABLE=false
if [ -n "${VAULT_CONSOLE_AUDIT_UPSTREAM}" ]; then
  case "${VAULT_CONSOLE_AUDIT_UPSTREAM}" in
    http://*) ;;
    *) fail "VAULT_CONSOLE_AUDIT_UPSTREAM must be an http:// origin on the private Docker network" ;;
  esac
  case "${VAULT_CONSOLE_AUDIT_UPSTREAM}" in
    *[!A-Za-z0-9._:/-]*) fail "VAULT_CONSOLE_AUDIT_UPSTREAM contains unsupported characters" ;;
  esac
  audit_authority="${VAULT_CONSOLE_AUDIT_UPSTREAM#http://}"
  case "${audit_authority}" in
    ""|*/*) fail "VAULT_CONSOLE_AUDIT_UPSTREAM must not contain a path" ;;
  esac
  VAULT_UI_AUDIT_AVAILABLE=true
fi

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
export VAULT_UI_ENVIRONMENT_NAME
export VAULT_UI_ENVIRONMENT_TONE
export VAULT_UI_AUDIT_AVAILABLE

if [ "${VAULT_UI_AUDIT_AVAILABLE}" = true ]; then
  cat > "${runtime_dir}/audit-location.conf" <<EOF_AUDIT
location /audit-api/ {
    access_log off;
    include /etc/nginx/security-headers.conf;
    proxy_pass ${VAULT_CONSOLE_AUDIT_UPSTREAM};
    proxy_http_version 1.1;
    proxy_set_header Host \$proxy_host;
    proxy_buffering off;
    proxy_connect_timeout 5s;
    proxy_read_timeout 60s;
}
EOF_AUDIT
else
  cat > "${runtime_dir}/audit-location.conf" <<'EOF_AUDIT'
location /audit-api/ {
    access_log off;
    default_type application/json;
    include /etc/nginx/security-headers.conf;
    return 404 '{"error":"the audit reader is not configured"}';
}
EOF_AUDIT
fi

envsubst \
  '${VAULT_UPSTREAM}' \
  < /etc/vault-console/server.conf.template \
  > "${runtime_dir}/server.conf"
envsubst \
  '${VAULT_UI_ALLOW_CUSTOM_ADDRESS} ${VAULT_UI_USERPASS_MOUNT} ${VAULT_UI_ALLOW_CUSTOM_USERPASS_MOUNT} ${VAULT_UI_ENVIRONMENT_NAME} ${VAULT_UI_ENVIRONMENT_TONE} ${VAULT_UI_AUDIT_AVAILABLE}' \
  < /etc/vault-console/runtime-config.js.template \
  > "${runtime_dir}/runtime-config.js"

nginx -t -c /etc/vault-console/nginx.conf
exec "$@"
