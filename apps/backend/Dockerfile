FROM node:23-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apk add --no-cache openssl \
    && corepack enable \
    && corepack prepare pnpm@10.6.2 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./

FROM base AS build

RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS prod-deps

RUN pnpm install --prod --frozen-lockfile
COPY prisma ./prisma
RUN pnpm prisma:generate

FROM node:23-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY public /public
COPY docker ./docker
COPY scripts ./scripts

RUN chmod +x ./docker/run.sh

ENTRYPOINT ["./docker/run.sh"]
