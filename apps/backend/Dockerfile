FROM node:23-alpine AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable
RUN apk add openssl
RUN pnpm config set store-dir ~/.pnpm-store

WORKDIR /app

COPY package*.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm prisma generate
RUN pnpm build

FROM node:23-alpine AS prod-deps
RUN corepack enable
RUN apk add openssl

WORKDIR /app

COPY . .
RUN pnpm config set store-dir ~/.pnpm-store
COPY package*.json pnpm-lock.yaml ./
RUN pnpm install --prod --prefer-offline
RUN pnpm prisma generate

FROM node:23-alpine AS runtime

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY public /public

COPY docker ./docker
COPY prisma ./prisma

RUN chmod +x ./docker/run.sh

ENTRYPOINT ["./docker/run.sh"]