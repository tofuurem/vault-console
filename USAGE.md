# Использование Vault Console

## Содержание

- [Требования](#требования)
- [Быстрый запуск](#быстрый-запуск)
- [Добавление в Compose с Vault](#добавление-в-compose-с-vault)
- [Готовый образ — необязательно](#готовый-образ--необязательно)
- [Настройка](#настройка)
- [Подготовка Vault](#подготовка-vault)
- [Reverse proxy и TLS](#reverse-proxy-и-tls)
- [Основные сценарии](#основные-сценарии)
- [Сессия и данные в браузере](#сессия-и-данные-в-браузере)
- [Обновление](#обновление)
- [Локальная разработка](#локальная-разработка)
- [Диагностика](#диагностика)

## Требования

- HashiCorp Vault с доступным HTTP API; проект проверен с Community `1.21.3`;
- существующий KV v2 mount или права на его создание;
- `userpass` auth method для управления пользователями;
- Docker и Docker Compose v2;
- общая external Docker network для Vault, Vault Console и reverse proxy.

## Быстрый запуск

```bash
git clone https://github.com/tofuurem/vault-console.git
cd vault-console
cp .env.example .env
```

```dotenv
VAULT_DOCKER_NETWORK=caddy_net
VAULT_UPSTREAM=http://vault:8200
```

Network должна существовать и быть подключена к Vault. `VAULT_UPSTREAM` —
внутренний адрес Vault в ней, без `/v1` и завершающего `/`.

```bash
docker compose up -d --build
docker compose ps vault-console
curl --fail http://127.0.0.1:8080/healthz
curl -i http://127.0.0.1:8080/v1/sys/health
```

`/healthz` проверяет контейнер UI. `/v1/sys/health` дополнительно проверяет
proxy и Vault. Sealed, standby и неинициализированный Vault могут возвращать
не `200`; см. [Vault health API](https://developer.hashicorp.com/vault/api-docs/system/health).

## Добавление в Compose с Vault

Сначала соберите образ в каталоге проекта:

```bash
docker build -t vault-console:local .
```

Затем добавьте сервис в Compose существующего Vault:

```yaml
services:
  vault-console:
    image: vault-console:local
    restart: unless-stopped
    environment:
      VAULT_UPSTREAM: http://vault:8200
      VAULT_UI_USERPASS_MOUNT: userpass
    ports:
      - "127.0.0.1:8080:8080"
    networks:
      - caddy_net

networks:
  caddy_net:
    external: true
```

Если Vault использует другое имя сервиса или network alias, измените
`VAULT_UPSTREAM`. Не передавайте Vault token, username или password через
Compose environment.

## Готовый образ — необязательно

Если вы самостоятельно публикуете образ, используйте нейтральный version tag:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag <your-registry>/vault-console:<version> \
  --push .
```

В Compose замените `vault-console:local` на
`<your-registry>/vault-console:<version>`. Для production зафиксируйте
конкретную версию или immutable digest и не используйте `latest`.

## Настройка

| Переменная | Значение по умолчанию | Назначение |
| --- | --- | --- |
| `VAULT_UPSTREAM` | обязательна | Внутренний URL Vault без `/v1` |
| `VAULT_DOCKER_NETWORK` | `caddy_net` | External network для Compose |
| `VAULT_CONSOLE_BIND` | `127.0.0.1` | Адрес публикации UI |
| `VAULT_CONSOLE_PORT` | `8080` | Порт UI на хосте |
| `VAULT_CONSOLE_IMAGE` | `vault-console:local` | Имя локального или собственного образа |
| `VAULT_UI_USERPASS_MOUNT` | `userpass` | Стандартный auth mount |
| `VAULT_UI_ALLOW_CUSTOM_ADDRESS` | `false` | Разрешить менять адрес Vault на login |
| `VAULT_UI_ALLOW_CUSTOM_USERPASS_MOUNT` | `false` | Разрешить менять auth mount на login |

Адрес Vault и auth mount обычно задаёт deployment. Advanced settings
включайте только когда оператору действительно нужен их выбор.

## Подготовка Vault

При необходимости включите KV v2 и `userpass`:

```bash
vault secrets enable -path=applications -version=2 kv
vault auth enable -path=userpass userpass
```

Полный шаблон административных прав находится в
[`deploy/vault-console-admin-policy.hcl.example`](deploy/vault-console-admin-policy.hcl.example):

```bash
vault policy write vault-console-admin \
  deploy/vault-console-admin-policy.hcl.example
```

Шаблон управляет policies, Identity, `userpass` и mounts. Перед применением
сузьте пути и замените `userpass` на фактический auth mount. Создание secrets
engine требует `sudo` вместе с `create`/`update`.

Admin policy не выдаёт доступ к значениям существующих KV v2 mounts. Для
чтения и навигации добавьте отдельную минимальную policy, например:

```hcl
path "applications/data/team/*" {
  capabilities = ["read"]
}

path "applications/metadata/team" {
  capabilities = ["list"]
}

path "applications/metadata/team/*" {
  capabilities = ["read", "list"]
}
```

Права на запись и версии выдавайте отдельно по соответствующим KV v2 API
paths. `LIST` раскрывает имена путей, даже если чтение data запрещено.

Интерфейс управляет визуальными ролями с prefix `vc-role-` и прямыми
пользовательскими policies `vc-user-<username>`. Сторонние или неподдерживаемые
HCL policies остаются External/read-only и не переписываются автоматически.

## Reverse proxy и TLS

Контейнер слушает порт `8080`. Пример Caddy:

```caddyfile
vault-console.example.com {
    reverse_proxy vault-console:8080
}
```

Готовый файл: [`deploy/Caddyfile.example`](deploy/Caddyfile.example). При
одном HTTPS origin запросы `/v1/*` идут в Vault внутри Docker network, поэтому
дополнительный CORS не нужен.

Если `VAULT_UPSTREAM` использует HTTPS с private CA:

1. положите публичный PEM CA с расширением `.crt` в
   `deploy/ca-certificates/`;
2. оставьте существующий read-only mount этого каталога из `compose.yml`;
3. пересоздайте контейнер.

Не помещайте туда private keys или credentials. Отключение проверки TLS не
поддерживается. Подробнее:
[`deploy/ca-certificates/README.md`](deploy/ca-certificates/README.md).

## Основные сценарии

### Вход

Доступны Vault token и `userpass`. Сессия действует в текущей вкладке, а
renewable token можно продлить вручную из её меню.

### KV v2

Explorer показывает доступные mounts, папки и secrets. Можно:

- создавать KV v2 mounts при наличии прав;
- искать в текущей папке или рекурсивно по metadata `LIST`;
- читать и редактировать вложенный JSON;
- сравнивать, удалять, восстанавливать и уничтожать версии;
- выполнять массовый soft delete или явный permanent destroy.

Soft delete обратим и предлагает короткий Undo. Destroy version и Delete
metadata необратимы и требуют явного подтверждения. Всегда проверяйте path и
номер версии перед применением.

### Access Center

Раздел объединяет Users, Groups, Roles и Policies. Он позволяет создавать
`userpass`-пользователей, генерировать пароль, назначать Identity groups,
визуальные роли и прямой KV-доступ.

Изменения выполняются через Review: UI показывает будущие операции и проверяет
актуальное состояние с Vault перед Apply. External resources и неподдерживаемый
HCL доступны только для безопасного просмотра.

### Навигация

`Ctrl+K` или `⌘K` открывает Command palette. Тема, плотность таблиц,
расположение Inspector и избранные пути настраиваются из интерфейса.

## Сессия и данные в браузере

- Vault token хранится в `sessionStorage` текущей вкладки до logout или expiry.
- Пароль `userpass` не сохраняется.
- Recent paths остаются в `sessionStorage`.
- Для `userpass` избранное и тема могут сохраняться в `localStorage`.
- Secret values, JSON keys и ответы Vault не сохраняются в истории навигации.

Используйте HTTPS, доверенный образ, CSP и минимальные policies. Подробности и
advisories находятся в [SECURITY.md](SECURITY.md).

Nginx не пишет access log для `/v1/*`, чтобы logical paths и usernames не
попадали в Docker logs. Для журнала операций настройте
[Vault audit device](https://developer.hashicorp.com/vault/docs/audit).

## Обновление

Для локальной сборки:

```bash
git pull --ff-only
docker compose build --pull vault-console
docker compose up -d vault-console
curl --fail http://127.0.0.1:8080/healthz
```

Для собственного опубликованного образа измените version tag, затем:

```bash
docker compose pull vault-console
docker compose up -d --no-build vault-console
```

## Локальная разработка

```bash
npm ci
VITE_VAULT_ADDR=http://127.0.0.1:8200 npm run dev
```

Требуются Node.js 22+ и npm. Откройте `http://localhost:3000`; не сохраняйте
credentials в `.env.local`. Проверки:

```bash
npm run quality
npm run build
npm run test:vault
npm run test:e2e
```

Интеграционные и браузерные проверки создают одноразовый Vault и требуют
Docker. Для первого E2E-запуска может понадобиться
`npx playwright install chromium`.

## Диагностика

```bash
docker compose logs --tail=200 vault-console
docker network inspect caddy_net
curl --fail http://127.0.0.1:8080/healthz
curl -i http://127.0.0.1:8080/v1/sys/health
```

| Симптом | Что проверить |
| --- | --- |
| UI не запускается | Docker logs, занятость порта и `/healthz` |
| Vault недоступен | `VAULT_UPSTREAM`, общую network, DNS-имя сервиса и sealed state |
| HTTPS upstream не работает | Имя в сертификате и подключённый private CA |
| Раздел или действие отсутствует | Capabilities текущего token на точные API paths |
| После login пустой Explorer | Права на `sys/internal/ui/mounts` и KV metadata/data |
| `403` в Inspector | Policy оператора; revoked token автоматически завершит сессию |

Vault Console не заменяет Vault audit devices, TLS, backups и операционный
контроль. При ошибке многошаговой операции UI показывает выполненные шаги и
recovery actions; перечитайте состояние Vault перед повторным Apply.
