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

- HashiCorp Vault с доступным HTTP API; проверено с Community `1.21.3` и `2.0.3`;
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
    read_only: true
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true
    tmpfs:
      - /tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777
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

Образ объявляет пользователя `nginx` и не требует root или Linux capabilities
для порта `8080`. Read-only root filesystem обязателен для рекомендуемого
production-профиля; runtime-конфиг, Nginx PID/temp files и CA bundle создаются
только в `/tmp/vault-console` внутри ограниченного tmpfs.

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
| `VAULT_UI_ENVIRONMENT_NAME` | пусто | Метка окружения в шапке и на входе, например `PROD` (до 24 символов: буквы, цифры, пробел, `.`, `_`, `-`) |
| `VAULT_UI_ENVIRONMENT_TONE` | `neutral` | Цвет метки: `neutral`, `info`, `warning` или `danger`; для `warning`/`danger` шапка получает цветную кромку |

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

Для совместимости со штатным Vault UI admin-шаблон также разрешает чтение
`sys/config/state/sanitized`. Этот root-namespace endpoint нужен нативному
представлению конфигурации, но не самому Vault Console; удалите stanza для ролей,
которым такая операторская видимость не требуется. Штатная policy `default`
должна оставаться прикреплена к UI-пользователям: она обеспечивает внутренние
UI-возможности, включая `sys/internal/ui/resultant-acl`.

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

Права для рабочих пространств Database, Transit, PKI и SSH собраны в
[`deploy/vault-console-engines-policy.hcl.example`](deploy/vault-console-engines-policy.hcl.example)
(проверен на Vault 1.21.3). Замените в нём пути mounts на свои и удалите
ненужные разделы. Для настройки engine (описание, lease TTL) нужны `read` и
`update` на `sys/mounts/<mount>/tune`, для отключения — `delete` на
`sys/mounts/<mount>`.

Готовый daily-KV шаблон находится в
[`deploy/vault-console-kv-daily-policy.hcl.example`](deploy/vault-console-kv-daily-policy.hcl.example).
Основные действия требуют разных точных capabilities:

| Действие | Vault API path | Capability |
| --- | --- | --- |
| Читать/писать secret | `applications/data/team/*` | `read`, `create`, `update` |
| Soft-delete фактическую latest-версию | `applications/data/team/*` | `delete` |
| Навигация и metadata | `applications/metadata/team/*` | `list`, `read` |
| Редактировать metadata ключа | `applications/metadata/team/*` | `update` |
| Полностью удалить ключ | `applications/metadata/team/*` | `delete` |
| Delete выбранных версий | `applications/delete/team/*` | `update` |
| Undelete выбранных версий | `applications/undelete/team/*` | `update` |
| Необратимо destroy выбранные версии | `applications/destroy/team/*` | `update` |
| Читать/менять defaults всего mount | `applications/config` | `read`, `update` |

Полное удаление metadata удаляет сам ключ, все его версии, custom metadata и
историю без возможности восстановления. Оно не равно soft delete latest или
destroy отдельных версий. Для bulk-удаления UI проверяет каждый exact path,
ограничивает параллелизм и требует фразу `DELETE N KEYS`.

`sys/capabilities-self` остаётся рекомендуемой, но необязательной preflight-
возможностью. Если capability discovery недоступен, UI показывает осторожно
сформулированную попытку действия, а окончательное решение принимает прямой
Vault API вызов. Подтверждённый capability deny по-прежнему скрывает или
блокирует действие.

Перед сохранением key metadata или defaults KV v2 mount UI повторно читает и
сравнивает свежий нормализованный snapshot с исходным. При конфликте mutation
не выполняется, локальный draft сохраняется, а заменить его можно только через
явный `Load latest`. Vault не предоставляет CAS для этих config endpoints,
поэтому read/update пара не заявляется как полностью атомарная.

Для пользователя, которому разрешена только полная запись известного секрета,
можно не выдавать `LIST` и `read`:

```hcl
path "sys/internal/ui/mounts" {
  capabilities = ["read"]
}

path "sys/capabilities-self" {
  capabilities = ["update"]
}

path "applications/data/team/rotated-token" {
  capabilities = ["create", "update"]
}
```

Такой пользователь открывает secret через `Open exact path`. Если metadata
читается, UI фиксирует CAS на свежей current version. Без metadata read
безопасный default — `Create only (CAS 0)`; `Write without CAS` требует
отдельного выбора и подтверждения полной замены неизвестного документа.

Для JSON-документов semantic validation выполняется с задержкой и не блокирует
каждый ввод. Выше 512 KiB редактор переключается на простой monospaced textarea
и показывает предупреждение о размере; `Format`, `Review` и `Save` всегда
валидируют точное текущее содержимое перед действием.

Интерфейс управляет визуальными ролями с prefix `vc-role-` и прямыми
пользовательскими policies `vc-user-<username>`. Сторонние или неподдерживаемые
HCL policies остаются External/read-only и не переписываются автоматически.

## Reverse proxy и TLS

Контейнер слушает порт `8080`.

### Отдельный сайт рядом с существующим Vault (рекомендуется)

Если Caddy уже обслуживает Vault на своём домене (например,
`vault.example.com`), добавьте Vault Console отдельным сайтом, не меняя ни
блок Vault, ни контейнер Vault. Готовый файл:
[`deploy/caddy/vault-console.caddy`](deploy/caddy/vault-console.caddy).

1. Скопируйте файл в каталог, смонтированный в контейнер Caddy, например
   `/etc/caddy/sites/vault-console.caddy`.
2. Добавьте в конец основного Caddyfile одну строку:

   ```caddyfile
   import /etc/caddy/sites/vault-console.caddy
   ```

3. Задайте домен консоли в окружении Caddy
   (`VAULT_CONSOLE_DOMAIN=vault-console.example.com`) или замените значение по
   умолчанию в файле.
4. Убедитесь, что Caddy, Vault и Vault Console подключены к одной network
   (`VAULT_DOCKER_NETWORK`), а `VAULT_UPSTREAM` указывает на Vault внутри неё.
5. Проверьте и перезагрузите Caddy:

   ```bash
   docker exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   ```

Весь трафик сайта идёт в `vault-console:8080`; встроенный Nginx сам
пересылает `/v1/*` в `VAULT_UPSTREAM`, поэтому Caddy не нужен маршрут к Vault
и CORS не требуется. Unseal, seal-status и health работают через тот же прокси,
пока Vault запечатан. Если Caddy запущен на хосте, а не в Docker, замените
upstream на `127.0.0.1:8080`. Access log в сайте намеренно не включён: пути
запросов содержат имена mounts, секретов и пользователей.

### Один origin со штатным Vault UI

Если Vault Console и штатный Vault UI работают на одном origin, явно разделите
UI и API routes:

```caddyfile
vault-console.example.com {
    encode zstd gzip

    @nativeVaultUi path /ui /ui/*
    handle @nativeVaultUi {
        reverse_proxy vault:8200
    }

    @vaultApi path /v1 /v1/*
    handle @vaultApi {
        reverse_proxy vault:8200
    }

    handle {
        reverse_proxy vault-console:8080
    }
}
```

Готовый файл: [`deploy/Caddyfile.example`](deploy/Caddyfile.example). При
одном HTTPS origin запросы `/v1/*` идут напрямую в Vault внутри Docker network,
поэтому дополнительный CORS не нужен. Если нативный UI не нужен, достаточно
проксировать весь origin в `vault-console:8080`: его Nginx также умеет
пересылать `/v1/*` в `VAULT_UPSTREAM`.

Если `VAULT_UPSTREAM` использует HTTPS с private CA:

1. положите публичный PEM CA с расширением `.crt` в
   `deploy/ca-certificates/`;
2. оставьте существующий read-only mount этого каталога из `compose.yml`;
3. пересоздайте контейнер.

Non-root entrypoint объединит системные и дополнительные сертификаты в
эфемерный `/tmp/vault-console/ca-certificates.crt`; системное trust store и
слои образа останутся read-only.

Не помещайте туда private keys или credentials. Отключение проверки TLS не
поддерживается. Подробнее:
[`deploy/ca-certificates/README.md`](deploy/ca-certificates/README.md).

## Журнал действий (Activity)

Vault не отдаёт свои audit-логи через API, поэтому журнал работает так:

1. Vault пишет file audit device в каталог на хосте.
2. Сервис `vault-console-audit` (из того же образа) читает этот файл только на
   чтение и отдаёт метаданные запросов: время, пользователь, операция, путь,
   адрес и результат. Тела запросов и ответов не отдаются вообще, даже в
   хешированном виде.
3. Консоль показывает раздел **Activity** с поиском, фильтрами и подгрузкой
   более старых записей.

Смотреть журнал могут только пользователи с `read` и `sudo` на `sys/audit` —
это то же право, что нужно для управления audit devices. Сервис проверяет его
через `sys/capabilities-self` с токеном пользователя и кэширует решение на 30
секунд по хешу токена.

Подготовка Vault (в compose Vault примонтируйте каталог, например
`./vault/audit:/vault/audit`):

```bash
docker exec -it vault vault audit enable file file_path=/vault/audit/audit.log
```

Запуск консоли вместе с журналом:

```dotenv
VAULT_AUDIT_DIR=/srv/vault/vault/audit
VAULT_AUDIT_FILE=audit.log
```

```bash
docker compose -f compose.yml -f compose.audit.yml up -d
```

`compose.audit.yml` запускает `vault-console-audit` от пользователя `100:1000`
(владелец audit-файла в официальном образе Vault), read-only, без capabilities.
Консоль проксирует `/audit-api/` в этот сервис; без него раздел Activity скрыт,
а `/audit-api/` отвечает 404. Поиск идёт от новых записей к старым и за один
запрос просматривает не больше 256 МБ файла (`AUDIT_READER_MAX_SCAN_MB`), поэтому
настройте ротацию audit-файла (`logrotate` с `copytruncate` или сигнал `SIGHUP`
Vault). Если Vault работает по HTTPS с private CA, передайте сервису
`VAULT_CACERT` с путём к PEM-файлу.

## Основные сценарии

### Вход

По умолчанию открывается `userpass` с нативным browser autofill; Vault token
доступен в соседней вкладке. Сессия действует в текущей вкладке, а renewable
token можно продлить вручную из её меню. `Copy token` передаёт значение прямо
в Clipboard API и не выводит его в DOM или toast. `Revoke token` вызывает
Vault `revoke-self` и может отозвать дочерние tokens, leases и dynamic secrets;
обычный `Sign out` очищает только текущую вкладку.

Чип с оставшимся временем сессии виден в шапке. Для renewable token в меню
сессии можно включить «Renew automatically»: консоль продлевает token один раз
за каждый lease, когда начинается предупреждение об истечении. Неудачное
продление не повторяется для того же lease, ручное продление остаётся доступным.
Настройка хранится в `localStorage` этого браузера.

Пункт «Seal Vault…» в меню сессии запечатывает Vault после ввода фразы
`SEAL VAULT`. Он нужен для инцидентов: все клиенты получают ошибки, пока
держатели ключей не распечатают Vault на странице `/unseal`. Требуются `sudo` и
`update` на `sys/seal`; консоль заранее проверяет права и блокирует действие
при подтверждённом отказе.

Self-service действия обычно приходят из Vault policy `default`. Для
`-no-default-policy` token выдайте их явно:

```hcl
path "auth/token/lookup-self" { capabilities = ["read"] }
path "auth/token/renew-self" { capabilities = ["update"] }
path "auth/token/revoke-self" { capabilities = ["update"] }
```

### Unseal после рестарта

После перезапуска Vault остаётся sealed, пока держатели ключей не введут
нужное число долей (threshold). Страница `/unseal` доступна без входа и
открывается из статуса на экране входа, из баннера внутри консоли (если Vault
запечатался во время работы) и из статуса в боковой панели.

- Страница показывает тип seal, threshold, число принятых долей и nonce
  текущей попытки, а прогресс обновляется каждые 5 секунд, поэтому несколько
  операторов могут вводить свои доли из разных браузеров.
- Каждая доля вводится отдельно в hex или base64, как её выдал
  `vault operator init`. Поле очищается сразу после отправки; значение не
  попадает в React state, storage, URL, логи или diagnostics.
- Повторно введённую долю Vault игнорирует, и UI об этом сообщает. Если
  набранные доли не расшифровали root key, Vault сбрасывает попытку, и UI
  просит начать заново.
- `Reset attempt` после подтверждения отбрасывает уже введённые доли.
- Для auto-unseal (KMS/HSM) страница только показывает статус: recovery keys
  не распечатывают Vault.
- Инициализация (`vault operator init`) намеренно не поддерживается, так как
  возвращает root token.

`sys/seal-status` и `sys/unseal` в Vault не требуют token, поэтому отдельная
policy не нужна; запросы идут через тот же same-origin `/v1/*` proxy. В HA
кластере каждый узел распечатывается отдельно, а страница работает с узлом, на
который указывает `VAULT_UPSTREAM`. Ввод unseal keys через браузер допустим
только по HTTPS и на доверенном устройстве.

### Overview

После входа открывается **Overview**: статус Vault (seal, роль узла, версия,
TLS), текущая сессия и оставшееся время, избранное, недавние секреты, KV mounts
и вход в Access Center. Overview всегда доступен первым пунктом сайдбара.

### KV v2

Explorer показывает доступные mounts, папки и secrets. Можно:

- создавать KV v2 mounts при наличии прав;
- искать в текущей папке или рекурсивно по metadata `LIST`, а без `LIST`
  открывать известный exact path;
- просматривать отдельные значения или весь секрет в полноэкранных Tree/JSON;
- редактировать вложенный JSON и выполнять явную write-only замену;
- сравнивать, soft-delete, undelete и permanently destroy версии;
- просматривать и редактировать metadata ключа и defaults KV v2 mount;
- полностью удалять один ключ или подтверждённый набор ключей.

В таблице папки видны колонки **Updated**, **Version** и **Owner** (ключ
`owner` в custom metadata). Metadata подгружается только для видимых строк, не
больше четырёх запросов одновременно; без права `read` на metadata в колонках
остаётся «—». Таблицу можно сортировать по имени, времени изменения и версии.

В Inspector секрета:

- меню копирования: логический путь, команда `vault kv get`, а также экспорт
  текущей версии в `.env` или JSON — значения попадают сразу в буфер обмена и
  не отображаются;
- вкладка **Access** показывает, какие userpass-пользователи, группы и роли
  могут читать, писать, удалять, перечислять и уничтожать этот секрет, и через
  какую политику. Учитываются только политики, которые консоль может прочитать
  и разобрать; при неполных данных вкладка явно предупреждает, что список —
  минимум. Токены, выпущенные не через userpass, не учитываются;
- **Share once…** создаёт одноразовый wrapping token на 5 минут, 1 час или 24
  часа (Vault response wrapping). Токен показывается один раз и не сохраняется.
  Получателю не нужен аккаунт консоли: он открывает `/unwrap`, видит, откуда и
  до какого времени выдан токен, и открывает секрет ровно один раз.

Редактор секрета открывает плоские строковые секреты в режиме **Fields**
(переключение на JSON без потери данных), скрывает значения до явного показа и
умеет генерировать стойкий пароль для поля.

Soft delete обратим и предлагает короткий Undo. Для latest-операции Vault
удаляет версию, которая является current в момент выполнения; UI перечитывает
metadata и привязывает Undo к фактически затронутому номеру. Destroy version и
Delete key permanently необратимы и требуют явного подтверждения.

### Secrets engines

Все engines, кроме KV v2, перечислены в разделе **Secrets engines** сайдбара,
на Overview и в Command palette. Кнопка **+** открывает диалог включения:
тип (KV v2, Database, Transit, PKI, SSH), путь, описание и, по желанию, лимиты
lease TTL. Кнопка **Settings** на странице engine меняет описание и lease TTL;
Vault показывает фактические значения, поэтому консоль отправляет только
изменённые поля, и унаследованные системные значения остаются
унаследованными. Отключение требует ввести путь mount: Vault отзывает все
leases этого engine и удаляет его данные без возможности восстановления.

Адрес страницы повторяет путь Vault, например `/engines/pki/roles/web` или
`/engines/transit/keys/app/encrypt`, поэтому перезагрузка и кнопка «назад»
возвращают в то же место. Секретные значения в адрес не попадают.

- **Database** — connections с выбором plugin и примером URL, verify при
  сохранении, Reset и Rotate root; динамические роли с шаблонами SQL;
  статические роли с ротацией по периоду или cron. **Generate credentials**
  каждый раз создаёт нового пользователя БД: значения скрыты, рядом показан
  lease с Renew и Revoke. Пароль connection только записывается и никогда не
  отображается.
- **Transit** — ключи всех типов, версии с отметками min decryption/encryption,
  Rotate, Trim и удаление (только после **Allow deletion**). Рабочая панель
  показывает лишь операции, которые поддерживает ключ: encrypt, decrypt,
  rewrap, data key, sign, verify, HMAC. Вкладка **Tools** — случайные байты и
  хеши.
- **PKI** — пустой mount предлагает создать root CA, intermediate (подписать
  CSR на другом PKI mount консоли или вставить внешний сертификат) или
  импортировать CA. Issuers, роли, **Issue certificate** и **Sign CSR**,
  список сертификатов с отзывом, tidy, URLs и CRL. Сертификаты разбираются
  прямо в браузере: subject, SAN, срок действия, ключ. Закрытый ключ
  показывается один раз, скрыт до явного показа и предлагает скопировать или
  скачать его перед закрытием. Вложенный путь вроде `pki/int` работает только
  если `pki/` сам не является mount.
- **SSH** — генерация или импорт signing CA с готовыми строками для
  `sshd_config` и `known_hosts`, роли `ca` и `otp`, **Sign key** с разбором
  выданного сертификата (principals, срок, расширения) и одноразовые пароли
  для хостов с `vault-ssh-helper`.
- **Остальные engines** (AWS, TOTP и другие) открываются в универсальном
  браузере: LIST выполняется сразу, а **Read** — только по кнопке, потому что
  чтение путей вроде `creds/` выпускает новые учётные данные.

Если Vault отклоняет операцию engine, консоль показывает его объяснение
(«common name evil.org not allowed by this role») после очистки от паролей,
токенов и PEM-блоков.

### Access Center

Раздел объединяет Users, Groups, Roles и Policies. Он позволяет создавать
`userpass`-пользователей, генерировать пароль, назначать Identity groups,
визуальные роли и прямой KV-доступ.

Изменения выполняются через Review: UI показывает будущие операции и проверяет
актуальное состояние с Vault перед Apply. External resources и неподдерживаемый
HCL доступны только для безопасного просмотра.

Release `0.8.1` не меняет поведение, данные или product scope Access Center.

### Навигация

`Ctrl+K` или `⌘K` открывает Command palette, `?` — список горячих клавиш. В
Explorer: `/` — поиск, `↑`/`↓`, `Home`/`End` — строки таблицы, `Enter` —
открыть, `e` — редактировать открытый секрет. Одиночные клавиши не работают,
пока вы вводите текст или открыт диалог. Тема, расположение Inspector и
избранные пути настраиваются из интерфейса. Таблицы используют один
comfortable layout; переключатель Compact/Comfortable удалён.

## Сессия и данные в браузере

- Vault token хранится в `sessionStorage` текущей вкладки
  (`vc-console.session.v1`) до logout или expiry.
- Unseal key shares никуда не сохраняются.
- Vault Console не сохраняет пароль `userpass`; password manager браузера
  может сохранить его по выбору пользователя.
- Recent paths остаются в `sessionStorage`.
- Для `userpass` избранное и тема могут сохраняться в `localStorage`.
- Secret values, JSON keys и ответы Vault не сохраняются в истории навигации.

Vault Console использует безопасный `vc-console` namespace для persistent
browser preferences. Версия `0.7.1` автоматически переносит прежние
`vault-console` keys при первом открытии `/`, чтобы они не пересекались с
зарезервированными token keys штатного Vault UI. Миграция не читает и не
переносит токены.

При первом открытии `0.8.0` удаляются только устаревшие density records
`vc-console:workspace-preferences:v1` и
`vault-console:workspace-preferences:v1`. Тема, Inspector, favorites, recents и
любые browser keys штатного Vault UI сохраняются.

Версия `0.8.1` не добавляет Vault data, policy или browser-storage migrations.

Версия `0.9.0` переносит tab-scoped keys в namespace `vc-console.*`. Recent
paths и session favorites переносятся автоматически. Старая запись token
(`vault-console.session.v1`) удаляется без копирования, поэтому вкладки,
открытые во время обновления, один раз попросят войти снова.

Версия `0.10.0` добавляет только одну browser-local запись,
`vc-console:session-preferences:v1` (автопродление сессии), и не переносит
существующие keys.

Сессии двух интерфейсов намеренно независимы. Вход в Vault Console на `/` не
авторизует вкладку штатного UI на `/ui/`; войдите в нативный UI отдельно. Если
существующий браузер сразу открывает `/ui/` после обновления и показывает белый
экран, сначала один раз откройте `/` для browser-local миграции или удалите
только прежние `vault-console*` keys через browser storage tools.

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

Обновление `0.9.0` → `0.10.0` не требует миграции Vault data, policies или
сессий. Новые возможности включаются по желанию:

- secrets engines работают с существующими правами; для рабочих пространств
  Database, Transit, PKI и SSH примените
  [`deploy/vault-console-engines-policy.hcl.example`](deploy/vault-console-engines-policy.hcl.example),
  а для настройки и отключения engines добавьте `read` и `delete` на
  `sys/mounts/*` (см. обновлённый admin-шаблон);
- Activity появляется только после подключения сервиса `vault-console-audit`
  и Vault file audit device (см. «Журнал действий»);
- метка окружения задаётся через `VAULT_UI_ENVIRONMENT_NAME` и
  `VAULT_UI_ENVIRONMENT_TONE`.

После rollout проверьте `/healthz`, вход token/userpass, exact-path read,
Overview, список Secrets engines в сайдбаре и открытие `/unseal`. При
необходимости можно вернуть immutable контейнер `0.9.0`; уже выполненные
Vault mutations (включённые или отключённые engines, выпущенные сертификаты и
credentials, permanent delete, unseal) откат образа не отменяет.

## Локальная разработка

```bash
npm ci
VAULT_DEV_UPSTREAM=http://127.0.0.1:8200 npm run dev
```

Требуются Node.js 22+ и npm. Dev-сервер проксирует `/v1/*` в
`VAULT_DEV_UPSTREAM`, повторяя same-origin схему production Nginx, поэтому CORS
на Vault не нужен. `VITE_VAULT_ADDR` по-прежнему позволяет обращаться к Vault
напрямую, если на нём настроен CORS. Откройте `http://localhost:3000`; не
сохраняйте credentials в `.env.local`. `npm ci` подключает `.githooks`
(pre-commit: type-check, lint, unit tests; pre-push: дополнительно build).
Проверки:

```bash
npm run quality
npm run test:coverage
npm run build
npm run audit:production
npm run audit
npm run test:container
VAULT_TEST_IMAGE=hashicorp/vault:2.0.3 npm run test:vault
VAULT_TEST_IMAGE=hashicorp/vault:1.21.3 npm run test:vault
VAULT_TEST_IMAGE=hashicorp/vault:2.0.3 npm run test:e2e
VAULT_TEST_IMAGE=hashicorp/vault:1.21.3 npm run test:e2e
```

Интеграционные и браузерные проверки создают одноразовый Vault и требуют
Docker. Для первого E2E-запуска может понадобиться
`npx playwright install chromium`.

GitHub Actions запускает тот же locked-install quality/coverage/build/audit
набор, integration matrix и production-container Chromium E2E matrix. Vault
2.0.3 обозначен основным окружением, а 1.21.3 — compatibility-контуром;
Playwright traces и screenshots выгружаются только при падении.

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
| После рестарта Vault sealed | Откройте `/unseal` и введите threshold долей ключа |
| Unseal не продвигается | Доля уже введена в этой попытке или принадлежит другому кластеру; при HA распечатайте каждый узел |
| HTTPS upstream не работает | Имя в сертификате и подключённый private CA |
| Раздел или действие отсутствует | Capabilities текущего token на точные API paths |
| После login пустой Explorer | Права на `sys/internal/ui/mounts` и KV metadata/data |
| Штатный `/ui/` показывает белый экран | Откройте `/` один раз для миграции legacy browser keys, затем перезагрузите `/ui/` |
| Нативный UI получает `resultant-acl` 403 | Войдите в `/ui/` отдельно и проверьте, что token включает policy `default` |
| Нативный admin UI получает `config/state/sanitized` 403 | Добавьте `read` на `sys/config/state/sanitized` только операторской роли |
| `403` в Inspector | Policy оператора; revoked token автоматически завершит сессию |

Vault Console не заменяет Vault audit devices, TLS, backups и операционный
контроль. При ошибке многошаговой операции UI показывает выполненные шаги и
recovery actions; перечитайте состояние Vault перед повторным Apply.
