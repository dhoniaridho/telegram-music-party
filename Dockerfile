FROM node:23-alpine AS build

RUN corepack enable && apk add --no-cache openssl
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
RUN pnpm install --frozen-lockfile --filter backend --filter dashboard

COPY . .
RUN pnpm --filter backend build

FROM node:23-alpine AS runtime

ENV NODE_ENV=production
RUN corepack enable && apk add --no-cache openssl
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=build /app/apps/backend/scripts ./apps/backend/scripts
COPY --from=build /app/apps/backend/docker ./apps/backend/docker
RUN pnpm install --prod --frozen-lockfile --filter backend \
    && pnpm --filter backend exec prisma generate --schema prisma/schema.prisma \
    && pnpm --filter backend exec prisma generate --schema prisma/sqlite/schema.prisma \
    && chmod +x ./apps/backend/docker/run.sh \
    && rm -rf /root/.local/share/pnpm/store /root/.cache/pnpm /root/.cache/node /root/.cache/prisma

WORKDIR /app/apps/backend
ENTRYPOINT ["./docker/run.sh"]
