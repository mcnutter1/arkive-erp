FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/
RUN pnpm install --filter @arkive/worker --frozen-lockfile=false

FROM deps AS build
COPY . .
RUN pnpm --filter @arkive/worker build

FROM node:22-alpine AS runtime
WORKDIR /app/apps/worker
ENV NODE_ENV=production
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/worker/node_modules ./node_modules
COPY --from=build /app/apps/worker/dist ./dist
COPY --from=build /app/apps/worker/package.json ./package.json
CMD ["node", "dist/index.js"]
