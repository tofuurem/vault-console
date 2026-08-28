# Vault Console

Self-hosted веб-интерфейс для HashiCorp Vault Community: работа с KV v2 и
визуальное управление доступом через `userpass`.

## Содержание

- [Возможности](#возможности)
- [Поддерживаемый scope](#поддерживаемый-scope)
- [Быстрый запуск](#быстрый-запуск)
- [Опубликованный образ](#опубликованный-образ)
- [Документация](#документация)
- [Безопасность](#безопасность)

## Возможности

- **KV v2:** mounts, папки, exact-path и рекурсивный поиск, вложенный JSON,
  версии, metadata/config, write-only CAS и одиночные или bulk-операции вплоть
  до полного удаления ключа.
- **Управление доступом:** пользователи `userpass`, Identity groups,
  визуальные роли и ACL policies с Review перед применением.
- **Рабочий интерфейс:** нативный autofill для `userpass`, настраиваемый
  Inspector, Command palette, избранное, недавние пути и светлая/тёмная тема.
- **Текущая сессия:** безопасное копирование token в clipboard, renew,
  revoke-self и отдельный локальный sign-out.
- **Least privilege:** интерфейс показывает только доступные текущему Vault
  token разделы и действия; окончательное решение всегда принимает Vault.
- **Защищённый runtime:** обязательные strict/complexity/coverage/audit gates и
  non-root read-only production-контейнер с проверенной матрицей Vault 2.0.3 и
  1.21.3.

## Поддерживаемый scope

Проект ориентирован на KV v2 и `userpass` в self-hosted Vault Community.
Database, Transit, PKI, SSH, облачные secrets engines, OIDC и аудит-аналитика
пока не поддерживаются.

## Быстрый запуск

Vault и UI должны находиться в общей Docker network. По умолчанию используется
`caddy_net`, а Vault доступен внутри неё как `http://vault:8200`.

```bash
git clone https://github.com/tofuurem/vault-console.git
cd vault-console
cp .env.example .env
docker compose up -d --build
curl --fail http://127.0.0.1:8080/healthz
```

Перед запуском проверьте в `.env` значения `VAULT_DOCKER_NETWORK` и
`VAULT_UPSTREAM`. Compose собирает локальный образ `vault-console:local` и не
изменяет существующий Vault. Production-контейнер работает как non-root,
использует read-only root filesystem, сбрасывает Linux capabilities и оставляет
записываемым только ограниченный `/tmp` tmpfs для runtime-конфига Nginx и CA
bundle.

## Опубликованный образ

Версия `0.8.1` опубликована для `linux/amd64` и `linux/arm64`. Для
воспроизводимого развёртывания используйте immutable digest:

```text
zero-noise-registry.registry.twcstorage.ru/vault-console:0.8.1@sha256:b7d10e153b507d40c389887966b92e8ec2cbcd1ef82b34b83395569f0d1a88e3
```

## Документация

- [USAGE.md](USAGE.md) — установка, Compose, Vault ACL, TLS, обновление и
  диагностика.
- [SECURITY.md](SECURITY.md) — модель безопасности и dependency advisories.
- [Admin policy example](deploy/vault-console-admin-policy.hcl.example) —
  полный шаблон прав оператора, который необходимо сузить под окружение.
- [Daily KV policy example](deploy/vault-console-kv-daily-policy.hcl.example) —
  точные KV v2 paths для ежедневного чтения, записи и lifecycle-операций.

## Безопасность

Vault остаётся единственным источником авторизации. Token хранится только в
`sessionStorage` текущей вкладки. Vault Console не сохраняет пароль `userpass`;
его сохранением и autofill может управлять браузер. Не передавайте credentials,
unseal key или recovery key через Git, `.env`, Compose или proxy headers.

Используйте HTTPS, доверенный образ и минимальные Vault policies. Проект
проверен с HashiCorp Vault Community `1.21.3` и `2.0.3`.
