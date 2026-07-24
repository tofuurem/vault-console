FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
ENV NGINX_ENVSUBST_FILTER=VAULT_UPSTREAM

COPY deploy/nginx.runtime.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/security-headers.conf /etc/nginx/security-headers.conf
COPY deploy/docker-entrypoint.d/05-install-vault-ca.sh /docker-entrypoint.d/05-install-vault-ca.sh
COPY deploy/docker-entrypoint.d/10-write-runtime-config.sh /docker-entrypoint.d/10-write-runtime-config.sh
COPY deploy/runtime-config.js.template /etc/vault-console/runtime-config.js.template
COPY --from=build /app/dist /usr/share/nginx/html

RUN chmod +x \
    /docker-entrypoint.d/05-install-vault-ca.sh \
    /docker-entrypoint.d/10-write-runtime-config.sh

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
