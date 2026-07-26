# Использование Vault Console

## Требования

- существующий HashiCorp Vault (релиз проверен с Vault Community `1.21.3`);
- общая external Docker network для Vault и Vault Console, в примерах — `caddy_net`;
- существующий KV v2 mount либо права Vault на его создание через UI;
- `userpass` auth method, если требуется управление пользователями;
- Docker Compose v2.

Vault Console не запускает, не перезапускает и не удаляет Vault.

## Запуск готового образа рядом с Vault

Добавьте сервис в Compose-файл существующего Vault:

```yaml
services:
  vault-console:
    image: zero-noise-registry.registry.twcstorage.ru/vault-console:0.3.0
    container_name: vault-console
    restart: unless-stopped
    environment:
      VAULT_UPSTREAM: http://vault:8200
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
Если сервис или network alias называется иначе, используйте его Docker DNS-имя.

Если registry требует авторизацию, предварительно выполните:

```bash
docker login zero-noise-registry.registry.twcstorage.ru
```

Не передавайте registry password в Compose-файле. Для неизменяемого
развёртывания вместо tag можно указать опубликованный digest:

```text
zero-noise-registry.registry.twcstorage.ru/vault-console:0.3.0@sha256:e538518e7f9844b9e21c08d0361f7b298f4c6c5c02a88ec5cd140d031486030b
```

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
curl -i http://127.0.0.1:8080/v1/sys/health
```

`/healthz` проверяет запуск самого UI-контейнера. `/v1/sys/health` проверяет
proxy и состояние Vault: кроме `200` active-сервер может вернуть, например,
`429` для standby, `501` для неинициализированного или `503` для sealed Vault.
Полный список кодов приведён в
[Vault health API](https://developer.hashicorp.com/vault/api-docs/system/health).

Маршрут `/v1/*` проксируется в Vault. Nginx не подставляет `X-Vault-Token`:
браузер отправляет token из `sessionStorage` текущей вкладки, а права проверяет
Vault. Token удаляется при logout или окончании известного lease; пароль
`userpass` не сохраняется.

## Срок сессии и ручное продление

Vault Console показывает оставшийся срок в меню сессии. Если token lookup или
ответ `userpass` не содержит надёжного expiry, UI пишет **No fixed expiry**:
это означает «срок неизвестен», а не гарантию бессрочного token. Поля TTL,
`renewable` и время последнего продления сохраняются вместе с tab session для
точного восстановления после reload.

Для leases длиннее пяти минут предупреждение появляется за пять минут. Для
коротких leases оно появляется в последние 20%, но не позднее чем за 30
секунд. Banner накладывается поверх workspace и не сдвигает таблицы. Его можно
скрыть только для текущего значения expiry; новый TTL после продления покажет
предупреждение снова при достижении порога.

Кнопка **Renew session** доступна только при `renewable: true`. Она вручную
вызывает `POST /v1/auth/token/renew-self` с token текущей вкладки, без
запрошенного `increment`. Vault Console не включает фоновое автопродление и
использует фактические `lease_duration` и `renewable` из ответа — возвращённый
TTL может оказаться короче предыдущего. Одновременно выполняется не более
одного renew-запроса.

Обычный отказ продления оставляет текущую сессию активной до её прежнего
expiry и скрывает повторное действие, если Vault сообщил, что продление
недоступно. Ответ о недействительном/истёкшем token очищает tab session,
навигационные recents и query cache и переводит на повторный вход. Token и
пароль не попадают в сообщения об ошибках или диагностические данные.

Контейнер выставляет CSP, Permissions-Policy, `nosniff`, `no-referrer` и запрет
встраивания во frame. Production build не содержит публичных source maps.
Build-time флаг `VAULT_UI_BUILD_SOURCEMAPS=true` следует использовать только
для отдельной приватной release-сборки:

```bash
VAULT_UI_BUILD_SOURCEMAPS=true npm run build
```

Полученные source maps нельзя раздавать из публичного контейнера.

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
VAULT_CONSOLE_IMAGE=zero-noise-registry.registry.twcstorage.ru/vault-console:0.3.0
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
2. Подключите каталог в контейнер:

   ```yaml
   volumes:
     - ./deploy/ca-certificates:/etc/vault-console/ca-certificates:ro
   ```

3. Пересоздайте контейнер Vault Console.

Подробности находятся в `deploy/ca-certificates/README.md`. Приватные ключи и Vault credentials в этот каталог помещать нельзя. Отключение проверки TLS не поддерживается.

## Отдельный origin и CORS

При прямом обращении браузера к Vault с другого origin разрешите точный адрес UI:

```bash
vault write sys/config/cors allowed_origins="https://console.example.com"
vault read sys/config/cors
```

Не используйте `*` в production. В рекомендуемой proxy-схеме через `/v1/*` отдельная настройка CORS не нужна.
Для direct-origin режима также включите
`VAULT_UI_ALLOW_CUSTOM_ADDRESS=true`; обычному same-origin deployment это не
требуется.

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

Шаблон разрешает создание secrets engine через `sys/mounts/*` и поэтому
является высокопривилегированным. Если mounts можно создавать только в
выделенном префиксе, замените stanza на более узкий, например
`sys/mounts/team/*`. Vault требует `sudo` вместе с `create`/`update` для
[enable secrets engine](https://developer.hashicorp.com/vault/api-docs/system/mounts).

Policy управления Vault Console не выдаёт доступ к данным существующих KV v2
mounts. Оператору отдельно нужны ACL на требуемые `<mount>/data/*`,
`<mount>/metadata` и `<mount>/metadata/*`, а если используются операции с
версиями — на `<mount>/delete/*`, `<mount>/undelete/*` и
`<mount>/destroy/*`. Vault остаётся источником истины: UI покажет только
разрешённые mounts и действия.

Роли, которыми управляет интерфейс, имеют prefix `vc-role-`, а прямая policy пользователя — `vc-user-<username>`. Сторонние HCL policies отображаются как External и не переписываются визуальным редактором, если их нельзя безопасно интерпретировать.

### Версии и подтверждение удаления

Soft delete текущей или выбранной версии обратим, поэтому диалог показывает
точный logical path и version, но не требует перепечатывать path. После
успешной операции в течение 10 секунд доступен однократный **Undo**; он
вызывает undelete только для указанной версии. Если Undo отклонён Vault,
ошибка остаётся в persistent notification, а остальные данные обновляются
обычным повторным чтением.

`Destroy version` и `Delete metadata` необратимы. Для них кнопка остаётся
заблокированной, пока оператор не введёт полный logical path в точности.
Destroy всегда отправляет явно выбранный номер версии; UI не угадывает его и
не предлагает Undo. Права на `<mount>/delete/*`, `<mount>/undelete/*`,
`<mount>/destroy/*` и `<mount>/metadata/*` следует выдавать независимо по
принципу least privilege.

### Массовое выделение

Чекбоксы Explorer выделяют только секреты: папки намеренно не участвуют в
массовых действиях. Shift-клик выделяет непрерывный диапазон видимых строк,
а чекбокс в заголовке добавляет или снимает только секреты, оставшиеся после
фильтра. Уже выбранные, но скрытые фильтром строки сохраняются, и панель явно
показывает их количество.

Выделение ограничено текущими mount и папкой. Переход в другую папку или mount,
а также `Esc` вне поля ввода и диалога очищает его. Это не глобальная очередь
операций: выбранный путь не может незаметно перейти в другой ACL scope.

Панель позволяет скопировать полные logical paths по одному на строку,
массово добавить или убрать секреты из локального Favorites и запустить
**Soft-delete latest**. Локальные действия не читают secret values и не
меняют Vault.

Перед массовым soft delete интерфейс одним запросом проверяет точные
capabilities на `<mount>/data/<path>`, `<mount>/metadata/<path>` и
`<mount>/undelete/<path>`, затем не более чем четырьмя параллельными
metadata-запросами фиксирует текущую версию каждого секрета. Preview отдельно
показывает готовые, запрещённые, уже удалённые и недоступные пути. Ничего не
удаляется до явного подтверждения.

Выполнение также ограничено четырьмя одновременными запросами. Частичный
результат не маскируется под успех: denied, missing и failed остаются в
persistent notification. После успешных операций один 10-секундный **Undo**
восстанавливает ровно зафиксированные версии и только для путей, где token
имеет `update` на `undelete`. Путь без этого права можно удалить, но preview
заранее помечает его как **No Undo permission**. После выполнения выделение
очищается, чтобы операция не была случайно повторена.

**Destroy versions…** использует отдельный необратимый flow. Preflight
проверяет `read` на `<mount>/metadata/<path>` и `update` на
`<mount>/destroy/<path>`, после чего показывает все ещё не уничтоженные
версии. Ни одна версия не отмечается автоматически: номера выбираются
оператором явно для каждого пути. Кнопка выполнения остаётся заблокированной,
пока не выбрана хотя бы одна версия и не введено точное имя mount.

Для каждого logical path UI отправляет один запрос только с отмеченными
номерами версий, максимум по два запроса одновременно. Частичный результат
остаётся в persistent notification. Permanent destroy не имеет Undo; после
успеха выделение очищается.

## Поиск KV v2 путей

В Explorer доступны два режима:

- **This folder** мгновенно фильтрует уже загруженный текущий уровень и не
  выполняет дополнительных запросов к Vault;
- **Entire mount** после двух введённых символов обходит видимые папки через
  KV v2 metadata `LIST`. Поиск работает только по именам логических путей:
  data keys и secret values не читаются и не индексируются.

Обход ограничен четырьмя параллельными `LIST`, 5000 новыми path entries и
2000 запросами на один проход. При достижении лимита UI показывает частичное
покрытие и явную кнопку **Continue scan**. Ошибка доступа к отдельной папке не
скрывает уже найденные результаты. Индекс живёт только в памяти вкладки до
пяти минут и очищается вместе с authenticated workspace.

Для mount `applications` рекурсивному поиску нужны только следующие
дополнительные права:

```hcl
path "applications/metadata" {
  capabilities = ["list"]
}

path "applications/metadata/*" {
  capabilities = ["list"]
}
```

Выдавайте их только на нужный prefix. Vault возвращает имена в разрешённом
`LIST`-scope даже когда чтение соответствующих secret data запрещено, поэтому
широкий `metadata/*` может раскрыть структуру и названия путей. Подробности:
[KV v2 API](https://developer.hashicorp.com/vault/api-docs/secret/kv/kv-v2).

## Избранное и недавние пути

Звезда в строке Explorer или заголовке Inspector добавляет папку либо секрет
в **Favorites**. **Recent** содержит до 20 последних секретов, данные которых
Vault успешно разрешил прочитать; неуспешный или запрещённый запрос туда не
попадает. В боковой панели показываются до восьми первых элементов каждого
списка.

Избранное содержит не более 100 путей. Для `userpass` оно сохраняется между
вкладками в `localStorage`, отдельно для комбинации Vault server и username.
Эта комбинация используется только как вход SHA-256: в имени storage key
остаётся укороченный hash. Для token-аутентификации стабильной идентичности
нет, поэтому избранное хранится только в `sessionStorage` текущей вкладки.
Recent всегда остаётся в `sessionStorage` и очищается при новом входе, logout
или expiry.

Навигационные записи содержат только mount, логический path, тип
`folder`/`secret` и локальную временную метку. Token, пароль, secret keys,
secret values и ответы Vault в них не записываются. Пользователь может удалить
обе локальные истории командой **Clear recent & favorite paths** в меню
сессии. Помните, что сами имена путей могут быть чувствительной
метаинформацией; при общем браузерном профиле используйте эту очистку.

## Тема интерфейса

В меню текущей сессии доступны три режима: **System**, **Light** и **Dark**.
Режим System следует настройке `prefers-color-scheme` операционной системы и
меняется без обновления страницы. Выбранный режим действует также на экран
входа и JSON-редактор.

Предпочтение хранится в `localStorage` браузера под отдельным ключом. Кроме
темы, там могут находиться только описанные выше `userpass` favorites. Token
остаётся в `sessionStorage` текущей вкладки, а пароли, secret values и ответы
Vault туда не записываются. Если браузер блокирует `localStorage`, тема и
избранное продолжат работать в памяти текущей вкладки, но не сохранятся после
её закрытия.

## Command palette и клавиатура

Нажмите `⌘K` в macOS или `Ctrl+K` в Windows/Linux либо кнопку поиска в верхней
панели. Palette открывается без запроса к Vault и позволяет:

- перейти к видимому KV v2 mount;
- открыть Favorite, Recent или уже проиндексированный path активного mount;
- запустить, продолжить либо отменить рекурсивное индексирование активного
  mount командой **Search entire …** / **Continue searching …** /
  **Cancel search …**;
- открыть доступный раздел Users, Groups, Roles или Policy Explorer;
- открыть создание KV v2 mount и обновить список mounts;
- переключить System, Light или Dark appearance.

Начните печатать для фильтрации, используйте `↑`/`↓` для выбора, `Enter` для
выполнения, `Home`/`End` для перехода к краям списка и `Esc` для закрытия.
После закрытия фокус возвращается на вызвавший элемент. Palette не обходит
mounts при открытии: индексирование запускается только явной командой и только
для активного mount. Cached folders и secrets имеют разные типы результата,
дубликаты из Favorite, Recent и индекса объединяются, а неполное покрытие
подписывается в строке команды. При очень большом наборе одновременно
показываются первые 100 совпадений — уточните запрос, чтобы сузить список.

Недоступные по известным capabilities разделы не добавляются, а локально
недоступные варианты показывают причину; Vault остаётся финальным источником
проверки прав при выполнении операции.

## Мобильная навигация

На экранах уже `640px` постоянный sidebar заменяется кнопкой меню в верхней
панели. Она открывает левый modal drawer с полными названиями mounts, Favorites,
Recent и доступных разделов Access Control. Переход по пункту закрывает drawer;
его также можно закрыть кнопкой, `Esc` или нажатием на backdrop. Пока drawer
открыт, фокус остаётся внутри него, а прокрутка страницы заблокирована.

Основные мобильные navigation targets имеют размер не меньше `44×44px`.
Контейнер использует dynamic viewport height и safe-area insets, а HTML
включает `viewport-fit=cover`, поэтому верхняя панель, drawer и нижний край
workspace не должны перекрываться browser chrome, вырезом или home indicator.
Desktop sidebar и его компактный режим начинают работать с breakpoint
`640px`.

## Глубокие logical paths

Breadcrumbs показывают mount и до четырёх сегментов без сворачивания. Для
более глубокого пути UI оставляет первый и два последних сегмента, а середину
заменяет кнопкой `…` с указанием числа скрытых частей для screen reader.
Нажатие раскрывает полный путь; отдельная кнопка снова сворачивает середину.

Строка не переносится и не увеличивает высоту Explorer header. На узком
экране её можно прокрутить горизонтально; каждый сегмент остаётся отдельной
клавиатурной и touch-доступной ссылкой на соответствующую папку.

## Состояния загрузки

Загрузка списков mounts, папок, пользователей, групп, policies и detail-панелей
показывается skeleton-блоками, повторяющими будущую структуру контента. Текст
состояния остаётся доступен через `role=status` для assistive technologies.
Спиннер используется только для короткого действия с уже видимым контекстом,
например submit, renew или capability check.

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
curl -i http://127.0.0.1:8080/v1/sys/health
```

Если UI открывается, но Vault недоступен, проверьте:

- что Vault распечатан и отвечает;
- что `VAULT_UPSTREAM` разрешается внутри общей Docker network;
- что имя в HTTPS URL присутствует в сертификате;
- что private CA смонтирован и доверен;
- что token или `userpass`-пользователь имеет права на нужные API paths.

При неожиданной ошибке экрана кнопка **Copy safe diagnostics** копирует только
версию UI, обобщённый route/operation, HTTP status, длительность, число retry,
Vault request ID и класс viewport. Конкретные Vault paths, username, token,
пароли, secret keys/values и тела запросов/ответов туда не включаются.

Vault Console не заменяет Vault audit devices, TLS, backup и операционный контроль. Создание пользователя состоит из нескольких Vault API calls: интерфейс выполняет безопасный retry и best-effort rollback, но Vault не предоставляет транзакцию для всей операции.
