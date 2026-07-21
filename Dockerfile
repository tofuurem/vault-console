FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ARG VITE_VAULT_ADDR
ENV VITE_VAULT_ADDR=${VITE_VAULT_ADDR}
RUN npm run build

FROM nginx:1.29-alpine
COPY deploy/nginx.spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
