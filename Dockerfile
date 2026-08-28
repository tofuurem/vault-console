FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.29-alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de

COPY deploy/nginx.conf /etc/vault-console/nginx.conf
COPY deploy/nginx.runtime.conf.template /etc/vault-console/server.conf.template
COPY deploy/security-headers.conf /etc/nginx/security-headers.conf
COPY deploy/runtime-config.js.template /etc/vault-console/runtime-config.js.template
COPY deploy/vault-console-entrypoint.sh /usr/local/bin/vault-console-entrypoint
COPY --from=build /app/dist /usr/share/nginx/html

RUN chmod 0555 /usr/local/bin/vault-console-entrypoint

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

ENTRYPOINT ["/usr/local/bin/vault-console-entrypoint"]
CMD ["nginx", "-c", "/etc/vault-console/nginx.conf", "-g", "daemon off;"]
