#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for the disposable Vault integration test." >&2
  exit 1
fi

vault_test_image="${VAULT_TEST_IMAGE:-hashicorp/vault:1.20}"
vault_test_container="vault-console-test-$$"
vault_test_root_token="vault-console-test-$(openssl rand -hex 24)"

cleanup_vault_test() {
  docker stop "${vault_test_container}" >/dev/null 2>&1 || true
}
trap cleanup_vault_test EXIT INT TERM

docker run \
  --detach \
  --rm \
  --cap-add=IPC_LOCK \
  --name "${vault_test_container}" \
  --env "VAULT_DEV_ROOT_TOKEN_ID=${vault_test_root_token}" \
  --env "VAULT_DEV_LISTEN_ADDRESS=0.0.0.0:8200" \
  --publish 127.0.0.1::8200 \
  "${vault_test_image}" \
  server -dev >/dev/null

vault_test_port=""
for _attempt in $(seq 1 80); do
  vault_test_port="$(docker port "${vault_test_container}" 8200/tcp 2>/dev/null | head -n 1 | sed 's/.*://')"
  if [[ -n "${vault_test_port}" ]] && curl --fail --silent --show-error "http://127.0.0.1:${vault_test_port}/v1/sys/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if [[ -z "${vault_test_port}" ]]; then
  echo "Disposable Vault did not expose its HTTP port." >&2
  exit 1
fi

vault_test_addr="http://127.0.0.1:${vault_test_port}"
if ! curl --fail --silent --show-error "${vault_test_addr}/v1/sys/health" >/dev/null 2>&1; then
  echo "Disposable Vault did not become ready." >&2
  exit 1
fi

VAULT_TEST_ADDR="${vault_test_addr}" \
VAULT_TEST_TOKEN="${vault_test_root_token}" \
npx vitest run src/integration/vault-community.test.ts --testTimeout=30000
