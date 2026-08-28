#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for the real-Vault browser test." >&2
  exit 1
fi

test_id="$$"
vault_image="${VAULT_TEST_IMAGE:-hashicorp/vault:2.0.3}"
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
vault_exec kv put applications/private/secret VALUE=restricted-prefix >/dev/null
vault_exec kv put applications/deep/one/two/three/four/five/secret VALUE=deep-path >/dev/null
vault_exec kv put applications/lifecycle STATE=first >/dev/null
vault_exec kv put applications/lifecycle STATE=second >/dev/null
vault_exec kv put applications/lifecycle STATE=third >/dev/null
vault_exec kv put applications/bulk-one STATE=first >/dev/null
vault_exec kv put applications/bulk-one STATE=second >/dev/null
vault_exec kv put applications/bulk-two STATE=first >/dev/null
vault_exec kv put applications/bulk-two STATE=second >/dev/null
vault_exec kv put applications/permanent-single STATE=delete-me >/dev/null
vault_exec kv put applications/permanent-bulk-one STATE=delete-me >/dev/null
vault_exec kv put applications/permanent-bulk-two STATE=delete-me >/dev/null
vault_exec kv put applications/metadata-roundtrip STATE=keep-me >/dev/null
vault_exec kv put applications/write-only-existing LEGACY=replace-me >/dev/null

docker exec \
  --interactive \
  --env VAULT_ADDR=http://127.0.0.1:8200 \
  --env "VAULT_TOKEN=${root_token}" \
  "${vault_container}" vault policy write e2e-userpass - >/dev/null <<'HCL'
path "sys/mounts" {
  capabilities = ["read"]
}

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

vault_exec write auth/userpass/users/e2e-login \
  password=e2e-password \
  token_policies=e2e-userpass \
  token_ttl=10m >/dev/null

vault_exec write auth/userpass/users/e2e-lifecycle \
  password=e2e-lifecycle-password \
  token_policies=default \
  token_ttl=45m \
  token_max_ttl=2h \
  token_explicit_max_ttl=90m \
  token_bound_cidrs=0.0.0.0/0 \
  token_type=service >/dev/null

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
  "${vault_container}" vault policy write vc-role-e2e-direct-editor - >/dev/null <<'HCL'
path "applications/data/teams/direct/*" {
  capabilities = ["create", "read", "update", "patch"]
}

path "applications/metadata/teams/direct" {
  capabilities = ["list"]
}

path "applications/metadata/teams/direct/*" {
  capabilities = ["read"]
}
HCL

docker exec \
  --interactive \
  --env VAULT_ADDR=http://127.0.0.1:8200 \
  --env "VAULT_TOKEN=${root_token}" \
  "${vault_container}" vault policy write vc-role-e2e-group-readers - >/dev/null <<'HCL'
path "applications/data/platform/*" {
  capabilities = ["read"]
}

path "applications/metadata/platform" {
  capabilities = ["list"]
}

path "applications/metadata/platform/*" {
  capabilities = ["read"]
}
HCL

docker exec \
  --interactive \
  --env VAULT_ADDR=http://127.0.0.1:8200 \
  --env "VAULT_TOKEN=${root_token}" \
  "${vault_container}" vault policy write vc-user-e2e-access - >/dev/null <<'HCL'
path "applications/data/lifecycle" {
  capabilities = ["create", "read", "update", "patch", "delete"]
}

path "applications/metadata" {
  capabilities = ["list"]
}

path "applications/metadata/lifecycle" {
  capabilities = ["read", "delete"]
}

path "applications/delete/lifecycle" {
  capabilities = ["update"]
}

path "applications/undelete/lifecycle" {
  capabilities = ["update"]
}

path "applications/destroy/lifecycle" {
  capabilities = ["update"]
}
HCL

docker exec \
  --interactive \
  --env VAULT_ADDR=http://127.0.0.1:8200 \
  --env "VAULT_TOKEN=${root_token}" \
  "${vault_container}" vault policy write e2e-external-audit - >/dev/null <<'HCL'
# This policy is intentionally external to Vault Console's managed prefixes.
path "applications/data/private/*" {
  capabilities = ["read"]
}
HCL

vault_exec write auth/userpass/users/e2e-access \
  password=e2e-access-password \
  token_policies=vc-role-e2e-direct-editor,vc-user-e2e-access,e2e-external-audit \
  token_ttl=10m >/dev/null

userpass_accessor="$(
  vault_exec auth list -format=json \
    | node -e 'const fs=require("node:fs");process.stdout.write(JSON.parse(fs.readFileSync(0,"utf8"))["userpass/"].accessor)'
)"
lifecycle_entity_id="$(
  vault_exec write -field=id identity/entity \
    name="E2E Lifecycle User" \
    metadata=managed_by=vault-console
)"
vault_exec write identity/entity-alias \
  name=e2e-lifecycle \
  canonical_id="${lifecycle_entity_id}" \
  mount_accessor="${userpass_accessor}" >/dev/null
access_entity_id="$(
  vault_exec write -field=id identity/entity \
    name="E2E Access Operator"
)"
vault_exec write identity/entity-alias \
  name=e2e-access \
  canonical_id="${access_entity_id}" \
  mount_accessor="${userpass_accessor}" >/dev/null
vault_exec write identity/group \
  name=e2e-access-team \
  type=internal \
  policies=vc-role-e2e-group-readers \
  member_entity_ids="${access_entity_id}" >/dev/null

docker exec \
  --interactive \
  --env VAULT_ADDR=http://127.0.0.1:8200 \
  --env "VAULT_TOKEN=${root_token}" \
  "${vault_container}" vault policy write e2e-access-reviewer - >/dev/null <<'HCL'
path "sys/internal/ui/mounts" {
  capabilities = ["read"]
}

path "sys/capabilities-self" {
  capabilities = ["update"]
}

path "sys/auth" {
  capabilities = ["read"]
}

path "auth/userpass/users" {
  capabilities = ["list"]
}

path "auth/userpass/users/*" {
  capabilities = ["read"]
}

path "applications/metadata" {
  capabilities = ["list"]
}

path "sys/policies/acl/vc-role-e2e-direct-editor" {
  capabilities = ["read"]
}
HCL

restricted_access_token="$(
  vault_exec token create \
    -no-default-policy \
    -policy=e2e-access-reviewer \
    -ttl=10m \
    -field=token
)"

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
revocable_token="$(vault_exec token create -policy=e2e-userpass -ttl=10m -field=token)"
restored_revocable_token="$(vault_exec token create -policy=e2e-userpass -ttl=10m -field=token)"

docker exec \
  --interactive \
  --env VAULT_ADDR=http://127.0.0.1:8200 \
  --env "VAULT_TOKEN=${root_token}" \
  "${vault_container}" vault policy write e2e-partial-list - >/dev/null <<'HCL'
path "sys/mounts" {
  capabilities = ["read"]
}

path "applications/data/platform/*" {
  capabilities = ["read"]
}

path "applications/metadata" {
  capabilities = ["list"]
}

path "applications/metadata/platform" {
  capabilities = ["read", "list"]
}

path "applications/metadata/platform/*" {
  capabilities = ["read", "list"]
}

path "applications/metadata/deep" {
  capabilities = ["read", "list"]
}

path "applications/metadata/deep/*" {
  capabilities = ["read", "list"]
}
HCL

partial_list_token="$(vault_exec token create -no-default-policy -policy=e2e-partial-list -ttl=10m -field=token)"

docker exec \
  --interactive \
  --env VAULT_ADDR=http://127.0.0.1:8200 \
  --env "VAULT_TOKEN=${root_token}" \
  "${vault_container}" vault policy write e2e-write-only - >/dev/null <<'HCL'
path "sys/internal/ui/mounts" {
  capabilities = ["read"]
}

path "applications/data/write-only-existing" {
  capabilities = ["create", "update"]
}
HCL

write_only_token="$(vault_exec token create -no-default-policy -policy=e2e-write-only -ttl=10m -field=token)"
self_service_token="$(vault_exec token create -policy=e2e-userpass -ttl=10m -renewable=true -field=token)"

docker compose up --detach --build

console_image_user="$(docker image inspect --format '{{.Config.User}}' "${console_image}")"
case "${console_image_user}" in
  ""|0|0:*|root|root:*)
    echo "Production image must declare a non-root OCI user." >&2
    exit 1
    ;;
esac
console_container_id="$(docker compose ps --quiet vault-console)"
if [ -z "${console_container_id}" ]; then
  echo "Compose did not create the Vault Console container." >&2
  exit 1
fi
if [ "$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "${console_container_id}")" != "true" ]; then
  echo "Compose did not enable a read-only root filesystem." >&2
  exit 1
fi
if ! docker inspect --format '{{json .HostConfig.CapDrop}}' "${console_container_id}" | grep -F 'ALL' >/dev/null; then
  echo "Compose did not drop all Linux capabilities." >&2
  exit 1
fi
if ! docker inspect --format '{{json .HostConfig.SecurityOpt}}' "${console_container_id}" | grep -F 'no-new-privileges:true' >/dev/null; then
  echo "Compose did not enforce no-new-privileges." >&2
  exit 1
fi
if ! docker inspect --format '{{json .HostConfig.Tmpfs}}' "${console_container_id}" | grep -F '/tmp' >/dev/null; then
  echo "Compose did not mount the minimal writable tmpfs." >&2
  exit 1
fi

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

if [ "$(docker compose exec -T vault-console id -u)" = "0" ]; then
  echo "Vault Console unexpectedly runs as root." >&2
  exit 1
fi
if ! docker compose exec -T vault-console test -s /tmp/vault-console/ca-certificates.crt; then
  echo "Vault Console runtime CA bundle was not generated." >&2
  exit 1
fi

require_header() {
  path="$1"
  header="$2"
  expected="$3"
  headers="$(curl --fail --silent --show-error --dump-header - --output /dev/null "${console_origin}${path}")"
  if ! printf '%s' "${headers}" | grep -iF "${header}" | grep -F "${expected}" >/dev/null; then
    echo "Missing expected ${header} header on ${path}: ${expected}" >&2
    exit 1
  fi
}

require_header "/" "Content-Security-Policy:" "script-src 'self'"
require_header "/" "Permissions-Policy:" "camera=()"
require_header "/runtime-config.js" "Cache-Control:" "no-store"
require_header "/v1/sys/health" "X-Content-Type-Options:" "nosniff"

runtime_config="$(curl --fail --silent --show-error "${console_origin}/runtime-config.js")"
if ! printf '%s' "${runtime_config}" | grep -F 'userpassMount: "userpass"' >/dev/null; then
  echo "Runtime config was not generated with the expected userpass mount." >&2
  exit 1
fi

if docker compose exec -T vault-console find /usr/share/nginx/html -type f -name '*.map' -print -quit | grep -q .; then
  echo "Production image unexpectedly contains public source maps." >&2
  exit 1
fi

PLAYWRIGHT_BASE_URL="${console_origin}" \
E2E_VAULT_TOKEN="${root_token}" \
E2E_LIMITED_VAULT_TOKEN="${limited_token}" \
E2E_PARTIAL_LIST_VAULT_TOKEN="${partial_list_token}" \
E2E_RESTRICTED_ACCESS_TOKEN="${restricted_access_token}" \
E2E_REVOCABLE_VAULT_TOKEN="${revocable_token}" \
E2E_RESTORED_REVOCABLE_VAULT_TOKEN="${restored_revocable_token}" \
E2E_WRITE_ONLY_VAULT_TOKEN="${write_only_token}" \
E2E_SELF_SERVICE_VAULT_TOKEN="${self_service_token}" \
npm run test:e2e:playwright

api_log_marker="vault-console-api-log-marker-${test_id}"
curl --silent --show-error --output /dev/null \
  "${console_origin}/v1/${api_log_marker}" || true
proxy_logs="$(docker compose logs --no-color vault-console 2>&1)"
if printf '%s' "${proxy_logs}" | grep -F "${api_log_marker}" >/dev/null; then
  echo "Vault API marker unexpectedly appeared in the default proxy log." >&2
  exit 1
fi
if printf '%s' "${proxy_logs}" | grep -E '"(GET|POST|PUT|DELETE|PATCH) /v1/' >/dev/null; then
  echo "A Vault API request path unexpectedly appeared in the default proxy log." >&2
  exit 1
fi
