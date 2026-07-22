# Vault Console

Отдельный self-hosted UI для HashiCorp Vault Community с фокусом на KV v2 и визуальное создание `userpass`-пользователей.

Текущая версия умеет:

- вход по Vault token и `userpass` (в том числе на нестандартном mount path);
- обнаружение доступных KV v2 mounts, виртуальные папки и поиск в текущей папке;
- создание и редактирование секретов с check-and-set;
- историю, сравнение, восстановление, soft delete, undelete, destroy и удаление metadata;
- чтение реальных userpass accounts, identity entities/aliases, внутренних groups и ACL policies;
- двухшаговое создание пользователя: `Account` → единый экран `Access`;
- выбор групп, прямых ролей и прямых KV-прав с предпросмотром effective access;
- создание account + entity + alias + group membership с безопасным retry и best-effort rollback;
- одноразовую передачу сгенерированного пароля без записи token/password в browser storage.

Облачные secrets engines, динамические database credentials, Transit, PKI, OIDC и статистика аудита в эту фазу не входят.

## Быстрый запуск

Требования: Node.js 22+ и npm.

```bash
npm ci
VITE_VAULT_ADDR=http://127.0.0.1:8200 npm run dev
```

Откройте `http://localhost:3000`. Для local development `VITE_VAULT_ADDR` задаёт начальный адрес реального Vault в форме; его можно изменить перед входом. Если переменная не задана, UI использует собственный origin — это режим production proxy. Token и пароль никогда не размещайте в `.env.local`.

Production build:

```bash
npm run quality
npm run build
npm run preview
```

Все шрифты и иконки входят в build; внешние CDN приложению не нужны.

## Production Compose с существующим Vault

`compose.yml` запускает только Vault Console. Он не создаёт, не перезапускает и не удаляет Vault или сеть. Оба контейнера должны находиться в существующей external network `caddy_net`.

Проверьте сеть и подключение Vault:

```bash
docker network inspect caddy_net
docker network connect caddy_net vault  # только если Vault ещё не подключён
```

Скопируйте настройки и укажите внутреннее имя контейнера Vault:

```bash
cp .env.example .env
```

```dotenv
VAULT_DOCKER_NETWORK=caddy_net
VAULT_UPSTREAM=http://vault:8200
VAULT_CONSOLE_BIND=127.0.0.1
VAULT_CONSOLE_PORT=8080
```

`VAULT_UPSTREAM` должен быть доступен из `caddy_net`; не добавляйте к нему `/v1` или завершающий `/`. В `.env` не должно быть Vault token, паролей, unseal или recovery keys.

Соберите и запустите UI:

```bash
docker compose config
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:8080/healthz
curl --fail http://127.0.0.1:8080/v1/sys/health
```

Контейнер обслуживает SPA на `8080`, а Nginx проксирует `/v1/*` в `VAULT_UPSTREAM`. Адрес upstream подставляется при старте контейнера, поэтому после его изменения достаточно выполнить:

```bash
docker compose up -d --force-recreate
```

Остановка UI не затрагивает Vault и external network:

```bash
docker compose down
```

### Caddy

Если существующий Caddy также подключён к `caddy_net`, он может обращаться к сервису по Docker DNS имени `vault-console`. Минимальный пример находится в `deploy/Caddyfile.example`:

```caddyfile
vault-console.example.com {
    reverse_proxy vault-console:8080
}
```

В этой схеме браузер видит один TLS origin:


```text
browser ── https://vault-console.example.com/     ──> Caddy ──> Vault Console
        └─ https://vault-console.example.com/v1/ ──> Caddy ──> Vault Console ──> Vault
```

Caddy и Nginx не подставляют `X-Vault-Token`: он приходит из памяти вкладки браузера и проверяется самим Vault.

### TLS до Vault и private CA

Для `VAULT_UPSTREAM=https://...` Nginx проверяет сертификат и SNI. Имя в URL должно присутствовать в сертификате и разрешаться внутри `caddy_net`. Для внутреннего CA положите только публичный PEM certificate с расширением `.crt` в `deploy/ca-certificates/`, затем пересоздайте контейнер. Каталог монтируется read-only, а `*.crt` исключены из Git и Docker build context.

Отключение проверки upstream TLS намеренно не поддерживается. Если внутри Docker network используется HTTP, TLS должен завершаться на доверенном внешнем proxy в соответствии с вашей моделью угроз.

## Отдельный origin и CORS

Если UI доступен, например, на `https://console.example.com`, а Vault — на `https://vault.example.com`, CORS настраивается в Vault из root namespace токеном с `sudo`:

```bash
vault write sys/config/cors allowed_origins="https://console.example.com"
vault read sys/config/cors
```

Vault уже разрешает стандартные `X-Vault-Token`, `Authorization` и content headers; дополнительные headers добавляйте только при реальной необходимости. Не используйте `*` для production. Официальный контракт: [Vault CORS API](https://developer.hashicorp.com/vault/api-docs/system/config-cors).

Если браузер показывает `Vault could not be reached`, для Compose-схемы сначала проверьте `docker compose logs`, Docker DNS имени из `VAULT_UPSTREAM`, seal status и CA trust. CORS относится только к прямому отдельному origin.

## Vault prerequisites

Нужен хотя бы один KV v2 mount и включённый userpass auth method:

```bash
vault secrets enable -path=applications -version=2 kv
vault auth enable -path=userpass userpass
```

Обычным разработчикам выдавайте только их KV policies. Раздел Access control появляется лишь при наличии administrative capabilities; окончательное разрешение каждой операции всегда проверяет Vault.

### Policy для оператора UI

Начальный шаблон: `deploy/vault-console-admin-policy.hcl.example`.

```bash
vault policy write vault-console-admin deploy/vault-console-admin-policy.hcl.example
```

Шаблон рассчитан на mount `auth/userpass/`. Для другого mount замените две последние path stanzas на точный путь. Не расширяйте их до всего `auth/*`: доступ к созданию users, identity aliases и group membership является высокопривилегированным. HashiCorp отдельно предупреждает, что изменение membership или alias может дать пользователю более сильные policies: [Identity concepts](https://developer.hashicorp.com/vault/docs/concepts/identity), [Identity group API](https://developer.hashicorp.com/vault/api-docs/secret/identity/group).

Роли, созданные/распознаваемые этим UI, имеют prefix `vc-role-`; прямая policy пользователя — `vc-user-<username>`. Сторонние policies показываются как External и остаются read-only.

Для самого KV доступа добавьте оператору или разработчику отдельные обычные policies. UI использует реальные Vault paths и не обходит ACL. Принцип token policies и identity/group policies описан в [Vault policies](https://developer.hashicorp.com/vault/docs/concepts/policies).

## Проверки

```bash
npm run quality       # TypeScript, ESLint, Vitest
npm run build         # production bundle
npm run test:e2e      # production Compose + disposable real Vault + Chromium
npm run test:vault    # disposable Vault Community container
```

Обе интеграционные команды требуют Docker и используют временный root token, который не печатается. `test:vault` проверяет API adapters и allowed/denied KV paths. `test:e2e` создаёт временную external network, поднимает отдельно управляемый disposable Vault, запускает production `compose.yml`, проверяет token login, KV v2, создание identity-backed `userpass`-пользователя и narrow layout, затем удаляет только созданные тестом контейнеры, сеть и UI image.

Перед первым E2E-запуском при необходимости установите браузер:

```bash
npx playwright install chromium
```

## Безопасность и ограничения

- Vault token и пароли хранятся только в памяти React tree и исчезают при reload/logout.
- Не размещайте token в `.env`, URL, reverse-proxy headers, localStorage или sessionStorage.
- UI не заменяет Vault ACL, audit devices, TLS, backups и операционный контроль.
- Создание пользователя состоит из нескольких Vault API calls и не является транзакцией Vault. UI показывает частичный результат, делает идемпотентный retry и предлагает best-effort rollback.
- External HCL не переписывается визуальным редактором, если его нельзя безопасно интерпретировать.
- Текущая реализация ориентирована на Vault Community и проверяется disposable образом `hashicorp/vault:1.20`.

Основной API ожидает TLS: [Vault HTTP API](https://developer.hashicorp.com/vault/api-docs). Встроенный Vault UI и API работают на одном listener: [Vault UI documentation](https://developer.hashicorp.com/vault/docs/ui).
