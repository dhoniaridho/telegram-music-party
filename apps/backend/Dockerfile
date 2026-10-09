FROM node:23-alpine AS build

RUN corepack enable && apk add --no-cache openssl
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/extension/package.json apps/extension/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter backend build

FROM node:23-alpine AS runtime

ENV NODE_ENV=production
RUN apk add --no-cache openssl
WORKDIR /app/apps/backend

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/backend/dist ./dist
COPY --from=build /app/apps/backend/prisma ./prisma
COPY --from=build /app/apps/backend/scripts ./scripts
COPY --from=build /app/apps/backend/docker ./docker
COPY --from=build /app/apps/backend/public ./public

RUN chmod +x ./docker/run.sh
ENTRYPOINT ["./docker/run.sh"]
