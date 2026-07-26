# Vault Console

Self-hosted веб-интерфейс для HashiCorp Vault Community, ориентированный на KV v2 и визуальное управление `userpass`-пользователями.

## Возможности

- вход по Vault token или `userpass`;
- восстановление сессии и текущего маршрута после обновления вкладки;
- живой TTL, предупреждение об expiry и ручное продление renewable token;
- работа с KV v2 mounts, папками, версиями и ограниченным рекурсивным поиском
  логических путей;
- создание KV v2 mounts с проверкой capabilities;
- нижний, правый и полноэкранный инспектор с сохранением раскладки;
- полноэкранный просмотр и CodeMirror-редактирование больших вложенных
  JSON-документов с точной строкой и колонкой ошибки;
- восстановление, soft delete с 10-секундным Undo, undelete, destroy и
  удаление metadata;
- компактный стек уведомлений без сдвига layout: успешные операции
  закрываются автоматически, ошибки остаются до явного закрытия;
- массовое выделение секретов в текущей папке с Shift-диапазоном,
  копированием путей, управлением избранным, проверяемым soft delete и
  явным выбором версий для permanent destroy;
- единый **Access Center** с локальными разделами Users, Groups, Roles и
  Policies;
- профиль `userpass`-пользователя с источниками доступа, полнотой отчёта и
  effective KV v2 matrix до отдельных data/metadata/version endpoints;
- полноэкранные lifecycle-workspace для безопасного редактирования
  пользователей, managed internal groups и визуальных KV-ролей;
- staged Review перед записью: permission diff, effect timing, проверка
  актуальности данных и точных Vault capabilities;
- смена `userpass`-пароля, disable/enable Identity и управляемое удаление
  логина с отдельным списком disabled Identity tombstones;
- ownership-модель, которая сохраняет external policies, aliases, nested
  groups и расширенные настройки `userpass`, не переписывая их молча;
- policy-derived paths без обхода хранилища и опциональное обнаружение
  видимых путей только через metadata `LIST`, без чтения значений секретов;
- создание `userpass`-пользователя с автоматически сгенерированным паролем;
- визуальное назначение групп, ролей и прямых прав на KV paths;
- светлая, тёмная и системная тема с переключением без перезагрузки;
- адаптивная навигация: desktop sidebar и полноразмерный mobile drawer с
  безопасными зонами и touch targets не меньше 44 px;
- сохраняемые режимы плотности таблиц **Comfortable** и **Compact**, причём
  мобильные touch targets остаются полноразмерными;
- command palette по `⌘K`/`Ctrl+K` для mounts, KV paths, access-control, тем
  и действий;
- избранные папки и секреты, а также последние успешно открытые секреты;
- безопасные диагностические данные и восстановление после ошибки экрана;
- единые skeleton states для загрузки рабочих списков и деталей без скачков
  layout;
- хранение token в `sessionStorage` текущей вкладки до logout/expiry; пароль
  никогда не сохраняется.

Облачные secrets engines, database credentials, Transit, PKI, OIDC и аудит-статистика пока не поддерживаются.

## Запуск

Текущий стабильный multi-architecture образ:

```text
zero-noise-registry.registry.twcstorage.ru/vault-console:0.6.0
```

Он публикуется для `linux/amd64` и `linux/arm64`. Для неизменяемой привязки
получите manifest digest после публикации и зафиксируйте его в Compose:

```bash
docker buildx imagetools inspect \
  zero-noise-registry.registry.twcstorage.ru/vault-console:0.6.0
```

Подробные инструкции по Docker Compose, подключению к существующему Vault,
Caddy, TLS, настройке policy, локальной разработке и обновлению находятся в
[USAGE.md](USAGE.md).

## Безопасность

Vault остаётся единственным источником авторизации: интерфейс не обходит ACL.
Для восстановления после reload token хранится в `sessionStorage` текущей
вкладки и удаляется при logout или expiry. Это JavaScript-readable storage,
поэтому production должен использовать доверенный образ, HTTPS и настроенный
CSP и Permissions-Policy. Production source maps по умолчанию не публикуются.
Пароль `userpass` не сохраняется. Не передавайте Vault token, пароли,
unseal keys или recovery keys через `.env`, Git и reverse-proxy headers.
В `localStorage` сохраняются выбранная тема и, только для `userpass`,
избранные логические пути в области, вычисленной из адреса Vault и имени
пользователя. Для token-сессий избранное остаётся в `sessionStorage`.
Значения секретов, credentials и ответы Vault не сохраняются в навигационной
истории.
Датированные решения по dependency advisories находятся в
[SECURITY.md](SECURITY.md).

Проект ориентирован на self-hosted Vault Community, проверен с Vault `1.21.3`.
Текущий исходный код и опубликованный образ имеют версию `0.6.0`.
