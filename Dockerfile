FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
ENV NGINX_ENVSUBST_FILTER=VAULT_UPSTREAM

COPY deploy/nginx.runtime.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/docker-entrypoint.d/05-install-vault-ca.sh /docker-entrypoint.d/05-install-vault-ca.sh
COPY deploy/docker-entrypoint.d/10-write-runtime-config.sh /docker-entrypoint.d/10-write-runtime-config.sh
COPY deploy/runtime-config.js.template /etc/vault-console/runtime-config.js.template
COPY --from=build /app/dist /usr/share/nginx/html

RUN chmod +x \
    /docker-entrypoint.d/05-install-vault-ca.sh \
    /docker-entrypoint.d/10-write-runtime-config.sh

EXPOSE 8080
