# Использование Vault Console

## Требования

- существующий HashiCorp Vault;
- общая external Docker network для Vault и Vault Console, в примерах — `caddy_net`;
- хотя бы один KV v2 mount;
- `userpass` auth method, если требуется управление пользователями;
- Docker Compose v2.

Vault Console не запускает, не перезапускает и не удаляет Vault.

## Запуск готового образа рядом с Vault

Добавьте сервис в Compose-файл существующего Vault:

```yaml
services:
  vault-console:
    image: zero-noise-registry.registry.twcstorage.ru/vault-console:0.2.1
    container_name: vault-console
    restart: unless-stopped
    environment:
      VAULT_UPSTREAM: http://vault:8200
      NGINX_ENVSUBST_FILTER: VAULT_UPSTREAM
      VAULT_UI_USERPASS_MOUNT: userpass
    ports:
      - "127.0.0.1:8080:8080"
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 5s
    networks:
      - caddy_net

networks:
  caddy_net:
    external: true
```

`VAULT_UPSTREAM` — внутренний URL Vault, доступный из контейнера UI. Не добавляйте к нему `/v1` или завершающий `/`. В примере имя сервиса Vault — `vault`.

Адрес Vault и стандартный auth mount скрыты на форме входа: их уже задаёт
deployment. Для редких конфигураций можно разрешить секцию Advanced:

```yaml
environment:
  VAULT_UI_ALLOW_CUSTOM_ADDRESS: "true"
  VAULT_UI_USERPASS_MOUNT: team/userpass
  VAULT_UI_ALLOW_CUSTOM_USERPASS_MOUNT: "true"
```

Эти параметры не содержат credentials. Token, username и password нельзя
передавать через environment.

Запустите и проверьте сервис:

```bash
docker compose pull vault-console
docker compose up -d vault-console
docker compose ps vault-console
curl --fail http://127.0.0.1:8080/healthz
curl --fail http://127.0.0.1:8080/v1/sys/health
```

Маршрут `/v1/*` проксируется в Vault. Nginx не подставляет `X-Vault-Token`:
браузер отправляет token из `sessionStorage` текущей вкладки, а права проверяет
Vault. Token удаляется при logout или окончании известного lease; пароль
`userpass` не сохраняется.

### Запуск через Compose из репозитория

```bash
cp .env.example .env
```

Укажите параметры:

```dotenv
VAULT_DOCKER_NETWORK=caddy_net
VAULT_UPSTREAM=http://vault:8200
VAULT_UI_ALLOW_CUSTOM_ADDRESS=false
VAULT_UI_USERPASS_MOUNT=userpass
VAULT_UI_ALLOW_CUSTOM_USERPASS_MOUNT=false
VAULT_CONSOLE_BIND=127.0.0.1
VAULT_CONSOLE_PORT=8080
VAULT_CONSOLE_IMAGE=zero-noise-registry.registry.twcstorage.ru/vault-console:0.2.1
```

Для готового образа:

```bash
docker compose pull
docker compose up -d --no-build
```

Для локальной сборки текущего исходного кода замените `VAULT_CONSOLE_IMAGE` на `vault-console:local` и выполните:

```bash
docker compose up -d --build
```

## Caddy

Если Caddy подключён к `caddy_net`, он может обращаться к контейнеру по Docker DNS имени:

```caddyfile
vault-console.example.com {
    reverse_proxy vault-console:8080
}
```

Готовый пример находится в `deploy/Caddyfile.example`. При такой схеме браузер работает с одним TLS origin, а Vault остаётся внутри Docker network.

## HTTPS между UI и Vault

Для `VAULT_UPSTREAM=https://...` сертификат Vault должен быть действителен для имени из URL. Если используется private CA:

1. Положите публичный PEM-сертификат CA с расширением `.crt` в `deploy/ca-certificates/`.
2. Подключите каталог в контейнер как `/etc/vault-console/ca-certificates:ro`.
3. Пересоздайте контейнер Vault Console.

Подробности находятся в `deploy/ca-certificates/README.md`. Приватные ключи и Vault credentials в этот каталог помещать нельзя. Отключение проверки TLS не поддерживается.

## Отдельный origin и CORS

При прямом обращении браузера к Vault с другого origin разрешите точный адрес UI:

```bash
vault write sys/config/cors allowed_origins="https://console.example.com"
vault read sys/config/cors
```

Не используйте `*` в production. В рекомендуемой proxy-схеме через `/v1/*` отдельная настройка CORS не нужна.

## Подготовка Vault

Пример включения KV v2 и `userpass`:

```bash
vault secrets enable -path=applications -version=2 kv
vault auth enable -path=userpass userpass
```

Раздел управления доступом показывается только пользователю с необходимыми административными capabilities. Базовый шаблон находится в `deploy/vault-console-admin-policy.hcl.example`:

```bash
vault policy write vault-console-admin deploy/vault-console-admin-policy.hcl.example
```

Перед применением проверьте и сузьте шаблон под своё окружение. Для нестандартного `userpass` mount замените пути `auth/userpass/...`. Не расширяйте их без необходимости до `auth/*`.

Роли, которыми управляет интерфейс, имеют prefix `vc-role-`, а прямая policy пользователя — `vc-user-<username>`. Сторонние HCL policies отображаются как External и не переписываются визуальным редактором, если их нельзя безопасно интерпретировать.

## Локальная разработка

Требуются Node.js 22+ и npm:

```bash
npm ci
VITE_VAULT_ADDR=http://127.0.0.1:8200 npm run dev
```

Откройте `http://localhost:3000`. `VITE_VAULT_ADDR` задаёт начальный адрес Vault в форме входа; token и пароль в `.env.local` размещать нельзя.

Проверки:

```bash
npm run quality
npm run build
npm run test:vault
npm run test:e2e
```

Интеграционные проверки требуют Docker. Перед первым E2E-запуском может потребоваться `npx playwright install chromium`.

## Обновление

После публикации новой версии измените tag образа в Compose и выполните:

```bash
docker compose pull vault-console
docker compose up -d --no-build vault-console
docker compose ps vault-console
```

Для воспроизводимого развертывания используйте фиксированный version tag, а не `latest`.

## Диагностика

```bash
docker compose logs --tail=200 vault-console
docker network inspect caddy_net
curl --fail http://127.0.0.1:8080/healthz
curl --fail http://127.0.0.1:8080/v1/sys/health
```

Если UI открывается, но Vault недоступен, проверьте:

- что Vault распечатан и отвечает;
- что `VAULT_UPSTREAM` разрешается внутри общей Docker network;
- что имя в HTTPS URL присутствует в сертификате;
- что private CA смонтирован и доверен;
- что token или `userpass`-пользователь имеет права на нужные API paths.

Vault Console не заменяет Vault audit devices, TLS, backup и операционный контроль. Создание пользователя состоит из нескольких Vault API calls: интерфейс выполняет безопасный retry и best-effort rollback, но Vault не предоставляет транзакцию для всей операции.
