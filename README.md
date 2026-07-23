# Vault Console

Self-hosted веб-интерфейс для HashiCorp Vault Community, ориентированный на KV v2 и визуальное управление `userpass`-пользователями.

## Возможности

- вход по Vault token или `userpass`;
- работа с KV v2 mounts, папками, поиском и версиями секретов;
- полноэкранный просмотр и редактирование больших вложенных JSON-документов;
- восстановление, soft delete, undelete, destroy и удаление metadata;
- просмотр пользователей, identity entities, групп и ACL policies;
- создание `userpass`-пользователя с автоматически сгенерированным паролем;
- визуальное назначение групп, ролей и прямых прав на KV paths;
- хранение token и пароля только в памяти вкладки браузера.

Облачные secrets engines, database credentials, Transit, PKI, OIDC и аудит-статистика пока не поддерживаются.

## Запуск

Готовый multi-architecture образ:

```text
zero-noise-registry.registry.twcstorage.ru/vault-console:0.2.0
```

Подробные инструкции по Docker Compose, подключению к существующему Vault, Caddy, TLS, настройке policy, локальной разработке и обновлению находятся в [USAGE.md](USAGE.md).

## Безопасность

Vault остаётся единственным источником авторизации: интерфейс не обходит ACL и не сохраняет учетные данные в browser storage. Не передавайте Vault token, пароли, unseal keys или recovery keys через `.env`, Git и reverse-proxy headers.

Проект ориентирован на self-hosted Vault Community и сейчас находится на версии `0.2.0`.
