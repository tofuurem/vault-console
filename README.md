# Vault Console

Self-hosted веб-интерфейс для HashiCorp Vault Community, ориентированный на KV v2 и визуальное управление `userpass`-пользователями.

## Возможности

- вход по Vault token или `userpass`;
- восстановление сессии и текущего маршрута после обновления вкладки;
- работа с KV v2 mounts, папками, поиском и версиями секретов;
- создание KV v2 mounts с проверкой capabilities;
- нижний, правый и полноэкранный инспектор с сохранением раскладки;
- полноэкранный просмотр и CodeMirror-редактирование больших вложенных
  JSON-документов с точной строкой и колонкой ошибки;
- восстановление, soft delete, undelete, destroy и удаление metadata;
- просмотр пользователей, identity entities, групп и ACL policies;
- создание `userpass`-пользователя с автоматически сгенерированным паролем;
- визуальное назначение групп, ролей и прямых прав на KV paths;
- безопасные диагностические данные и восстановление после ошибки экрана;
- хранение token в `sessionStorage` текущей вкладки до logout/expiry; пароль
  никогда не сохраняется.

Облачные secrets engines, database credentials, Transit, PKI, OIDC и аудит-статистика пока не поддерживаются.

## Запуск

Готовый multi-architecture образ:

```text
zero-noise-registry.registry.twcstorage.ru/vault-console:0.3.0
```

Он опубликован для `linux/amd64` и `linux/arm64`. Для развёртывания с
неизменяемой привязкой используйте digest:

```text
zero-noise-registry.registry.twcstorage.ru/vault-console:0.3.0@sha256:e538518e7f9844b9e21c08d0361f7b298f4c6c5c02a88ec5cd140d031486030b
```

Подробные инструкции по Docker Compose, подключению к существующему Vault, Caddy, TLS, настройке policy, локальной разработке и обновлению находятся в [USAGE.md](USAGE.md).

## Безопасность

Vault остаётся единственным источником авторизации: интерфейс не обходит ACL.
Для восстановления после reload token хранится в `sessionStorage` текущей
вкладки и удаляется при logout или expiry. Это JavaScript-readable storage,
поэтому production должен использовать доверенный образ, HTTPS и настроенный
CSP и Permissions-Policy. Production source maps по умолчанию не публикуются.
Пароль `userpass` не сохраняется. Не передавайте Vault token, пароли,
unseal keys или recovery keys через `.env`, Git и reverse-proxy headers.

Проект ориентирован на self-hosted Vault Community, проверен с Vault `1.21.3`
и сейчас находится на версии `0.3.0`.
