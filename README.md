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
cp .env.example .env.local
npm ci
npm run dev
```

Откройте `http://localhost:3000`. `VITE_VAULT_ADDR` задаёт только начальный адрес в форме; его можно изменить перед входом. Это публичная build-time настройка, а не место для token.

Production build:

```bash
npm run quality
npm run build
npm run preview
```

Для развёртывания под `/console/` задайте `BASE_PATH=/console/` до сборки. Все шрифты и иконки входят в build; внешние CDN приложению не нужны.

## Docker

Standalone image (для отдельного origin):

```bash
docker build \
  --build-arg VITE_VAULT_ADDR=https://vault.example.com \
  -t vault-console:local .
docker run --rm -p 8080:8080 vault-console:local
```

Контейнер обслуживает SPA на порту `8080`. Конфигурация находится в `deploy/nginx.spa.conf`.

## Рекомендуемая схема: один origin

Безопаснее и проще обслуживать UI и `/v1/` Vault через один TLS hostname:

```text
browser ── https://vault.example.com/     ──> static Vault Console
        └─ https://vault.example.com/v1/ ──> Vault :8200
```

Пример — `deploy/nginx.same-origin.conf.example`. Reverse proxy не должен подставлять или логировать `X-Vault-Token`; этот header приходит только от браузера и проверяется самим Vault. Для production используйте доверенный TLS certificate и обычные правила защиты/редакции access logs вашей инфраструктуры.

## Отдельный origin и CORS

Если UI доступен, например, на `https://console.example.com`, а Vault — на `https://vault.example.com`, CORS настраивается в Vault из root namespace токеном с `sudo`:

```bash
vault write sys/config/cors allowed_origins="https://console.example.com"
vault read sys/config/cors
```

Vault уже разрешает стандартные `X-Vault-Token`, `Authorization` и content headers; дополнительные headers добавляйте только при реальной необходимости. Не используйте `*` для production. Официальный контракт: [Vault CORS API](https://developer.hashicorp.com/vault/api-docs/system/config-cors).

Если браузер показывает `Vault could not be reached`, сначала проверьте TLS trust, затем CORS и доступность `/v1/sys/health` из браузерной сети.

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
npm run test:e2e      # Chromium: login, KV, create user, retry, narrow layout
npm run test:vault    # disposable Vault Community container
```

`npm run test:vault` требует Docker. Скрипт генерирует временный root token, не печатает его, поднимает отдельный Vault dev container, проверяет создание identity-backed пользователя и allowed/denied KV paths, затем останавливает контейнер.

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
