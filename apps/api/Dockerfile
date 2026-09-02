FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
RUN pnpm install --filter @arkive/api... --frozen-lockfile=false
RUN pnpm --filter @arkive/api prisma:generate

FROM deps AS build
COPY . .
RUN pnpm --filter @arkive/api build

FROM node:22-alpine AS runtime
WORKDIR /app/apps/api
ENV NODE_ENV=production
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/apps/api/prisma ./prisma
CMD ["node", "dist/src/main.js"]
