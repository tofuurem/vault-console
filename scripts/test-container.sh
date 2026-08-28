#!/usr/bin/env bash
set -euo pipefail

for command in curl docker openssl; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "${command} is required for the production container smoke test." >&2
    exit 1
  fi
done

container_test_id="$$"
container_test_image="${CONTAINER_TEST_IMAGE:-vault-console:container-test-${container_test_id}}"
container_test_name="vault-console-container-test-${container_test_id}"
container_test_dir="$(mktemp -d)"
container_test_certificate="${container_test_dir}/custom-ca.crt"
container_test_key="${container_test_dir}/custom-ca.key"

cleanup_container_test() {
  docker rm --force "${container_test_name}" >/dev/null 2>&1 || true
  rm -rf "${container_test_dir}"
}
trap cleanup_container_test EXIT INT TERM

if [ -z "${CONTAINER_TEST_IMAGE:-}" ]; then
  docker build --tag "${container_test_image}" . >/dev/null
fi

container_test_user="$(docker image inspect --format '{{.Config.User}}' "${container_test_image}")"
case "${container_test_user}" in
  ""|0|0:*|root|root:*)
    echo "Production image must declare a non-root OCI user." >&2
    exit 1
    ;;
esac

openssl req \
  -x509 \
  -newkey rsa:2048 \
  -nodes \
  -days 1 \
  -subj '/CN=vault-console-container-test' \
  -keyout "${container_test_key}" \
  -out "${container_test_certificate}" >/dev/null 2>&1
chmod 0644 "${container_test_certificate}"
container_test_certificate_marker="$(sed -n '2p' "${container_test_certificate}")"

docker run \
  --detach \
  --name "${container_test_name}" \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777 \
  --env VAULT_UPSTREAM=http://127.0.0.1:8200 \
  --env VAULT_UI_ALLOW_CUSTOM_ADDRESS=true \
  --env VAULT_UI_ALLOW_CUSTOM_USERPASS_MOUNT=true \
  --env VAULT_UI_USERPASS_MOUNT=teams/userpass \
  --volume "${container_test_certificate}:/etc/vault-console/ca-certificates/custom-ca.crt:ro" \
  --publish 127.0.0.1::8080 \
  "${container_test_image}" >/dev/null

container_test_port=""
container_test_ready=false
for _attempt in $(seq 1 80); do
  container_test_port="$(docker port "${container_test_name}" 8080/tcp 2>/dev/null | head -n 1 | sed 's/.*://' || true)"
  if [ -n "${container_test_port}" ] && curl --fail --silent --show-error "http://127.0.0.1:${container_test_port}/healthz" >/dev/null 2>&1; then
    container_test_ready=true
    break
  fi
  sleep 0.25
done
if [ "${container_test_ready}" != true ]; then
  echo "Production container did not become ready on port 8080." >&2
  docker logs "${container_test_name}" >&2 || true
  exit 1
fi

container_test_origin="http://127.0.0.1:${container_test_port}"
if [ "$(curl --fail --silent --show-error "${container_test_origin}/healthz")" != "ok" ]; then
  echo "Production container health endpoint returned an unexpected body." >&2
  exit 1
fi
container_test_runtime="$(curl --fail --silent --show-error "${container_test_origin}/runtime-config.js")"
if ! printf '%s' "${container_test_runtime}" | grep -F 'allowCustomVaultAddress: true' >/dev/null \
  || ! printf '%s' "${container_test_runtime}" | grep -F 'userpassMount: "teams/userpass"' >/dev/null; then
  echo "Production container runtime config was not generated correctly." >&2
  exit 1
fi
container_test_index="$(curl --fail --silent --show-error "${container_test_origin}/login/deep-link")"
if ! printf '%s' "${container_test_index}" | grep -F '<div id="root"></div>' >/dev/null; then
  echo "Production container did not serve the SPA fallback." >&2
  exit 1
fi
container_test_asset="$(printf '%s' "${container_test_index}" | sed -n 's/.*src="\(\/assets\/[^\"]*\.js\)".*/\1/p' | head -n 1)"
if [ -z "${container_test_asset}" ]; then
  echo "Production container index did not reference a JavaScript asset." >&2
  exit 1
fi
curl --fail --silent --show-error "${container_test_origin}${container_test_asset}" >/dev/null

if ! docker exec "${container_test_name}" grep -F "${container_test_certificate_marker}" /tmp/vault-console/ca-certificates.crt >/dev/null; then
  echo "Custom Vault CA certificate was not added to the runtime trust bundle." >&2
  exit 1
fi
if [ "$(docker exec "${container_test_name}" id -u)" = "0" ]; then
  echo "Production container process unexpectedly runs as root." >&2
  exit 1
fi
if [ "$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "${container_test_name}")" != "true" ]; then
  echo "Production container root filesystem is not read-only." >&2
  exit 1
fi
if ! docker inspect --format '{{json .HostConfig.CapDrop}}' "${container_test_name}" | grep -F 'ALL' >/dev/null; then
  echo "Production container did not drop all Linux capabilities." >&2
  exit 1
fi
if ! docker inspect --format '{{json .HostConfig.SecurityOpt}}' "${container_test_name}" | grep -F 'no-new-privileges:true' >/dev/null; then
  echo "Production container does not enforce no-new-privileges." >&2
  exit 1
fi

echo "Production container smoke passed for non-root, read-only, runtime config, custom CA, assets, and SPA fallback."
