#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for the real-Vault browser test." >&2
  exit 1
fi

test_id="$$"
vault_image="${VAULT_TEST_IMAGE:-hashicorp/vault:1.20}"
vault_container="vault-console-e2e-vault-${test_id}"
docker_network="vault-console-e2e-${test_id}"
console_image="vault-console:e2e-${test_id}"
root_token="vault-console-e2e-$(openssl rand -hex 24)"
console_port="$(node -e 'const server=require("node:net").createServer();server.listen(0,"127.0.0.1",()=>{console.log(server.address().port);server.close();});')"

export COMPOSE_PROJECT_NAME="vault-console-e2e-${test_id}"
export VAULT_CONSOLE_BIND=127.0.0.1
export VAULT_CONSOLE_PORT="${console_port}"
export VAULT_CONSOLE_IMAGE="${console_image}"
export VAULT_DOCKER_NETWORK="${docker_network}"
export VAULT_UPSTREAM=http://vault-e2e:8200

cleanup_compose_e2e() {
  docker compose down --remove-orphans --rmi local >/dev/null 2>&1 || true
  docker stop "${vault_container}" >/dev/null 2>&1 || true
  docker network rm "${docker_network}" >/dev/null 2>&1 || true
}
trap cleanup_compose_e2e EXIT INT TERM

docker network create "${docker_network}" >/dev/null
docker run \
  --detach \
  --rm \
  --cap-add=IPC_LOCK \
  --name "${vault_container}" \
  --network "${docker_network}" \
  --network-alias vault-e2e \
  --env "VAULT_DEV_ROOT_TOKEN_ID=${root_token}" \
  --env "VAULT_DEV_LISTEN_ADDRESS=0.0.0.0:8200" \
  "${vault_image}" \
  server -dev >/dev/null

vault_ready=false
for _attempt in $(seq 1 80); do
  if docker exec \
    --env VAULT_ADDR=http://127.0.0.1:8200 \
    --env "VAULT_TOKEN=${root_token}" \
    "${vault_container}" vault status >/dev/null 2>&1; then
    vault_ready=true
    break
  fi
  sleep 0.25
done

if [ "${vault_ready}" != true ]; then
  echo "Disposable Vault did not become ready." >&2
  exit 1
fi

vault_exec() {
  docker exec \
    --env VAULT_ADDR=http://127.0.0.1:8200 \
    --env "VAULT_TOKEN=${root_token}" \
    "${vault_container}" vault "$@"
}

vault_exec secrets enable -path=applications -description="Application secrets" -version=2 kv >/dev/null
vault_exec auth enable -path=userpass userpass >/dev/null
vault_exec kv put applications/shared API_KEY=real-vault-e2e-value >/dev/null
vault_exec kv put applications/platform/api URL=https://api.example.test >/dev/null

docker exec \
  --interactive \
  --env VAULT_ADDR=http://127.0.0.1:8200 \
  --env "VAULT_TOKEN=${root_token}" \
  "${vault_container}" vault write applications/data/nested - >/dev/null <<'JSON'
{
  "data": {
    "service": {
      "credentials": { "access": "real-vault-nested-value" },
      "ports": [443, 8443],
      "enabled": true
    }
  }
}
JSON

docker exec \
  --interactive \
  --env VAULT_ADDR=http://127.0.0.1:8200 \
  --env "VAULT_TOKEN=${root_token}" \
  "${vault_container}" vault policy write vc-role-platform-readers - >/dev/null <<'HCL'
path "applications/data/*" {
  capabilities = ["read"]
}

path "applications/metadata" {
  capabilities = ["read", "list"]
}

path "applications/metadata/*" {
  capabilities = ["read", "list"]
}
HCL

vault_exec write identity/group \
  name=platform-team \
  type=internal \
  policies=vc-role-platform-readers >/dev/null

docker exec \
  --interactive \
  --env VAULT_ADDR=http://127.0.0.1:8200 \
  --env "VAULT_TOKEN=${root_token}" \
  "${vault_container}" vault policy write e2e-data-only - >/dev/null <<'HCL'
path "applications/data/*" {
  capabilities = ["read"]
}

path "applications/metadata" {
  capabilities = ["list"]
}

path "applications/metadata/*" {
  capabilities = ["list"]
}
HCL

limited_token="$(vault_exec token create -no-default-policy -policy=e2e-data-only -ttl=10m -field=token)"

docker compose up --detach --build

console_origin="http://127.0.0.1:${console_port}"
console_ready=false
for _attempt in $(seq 1 120); do
  if curl --fail --silent --show-error "${console_origin}/healthz" >/dev/null 2>&1 && \
    curl --fail --silent --show-error "${console_origin}/v1/sys/health" >/dev/null 2>&1; then
    console_ready=true
    break
  fi
  sleep 0.25
done

if [ "${console_ready}" != true ]; then
  echo "Vault Console or its real-Vault proxy did not become ready." >&2
  docker compose logs --no-color >&2 || true
  exit 1
fi

PLAYWRIGHT_BASE_URL="${console_origin}" \
E2E_VAULT_TOKEN="${root_token}" \
E2E_LIMITED_VAULT_TOKEN="${limited_token}" \
npm run test:e2e:playwright
