# Build stage — install + build inside Linux container
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Copy package manifests + root configs + source (node_modules excluded by .dockerignore)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json biome.json ./
COPY apps apps/
COPY packages packages/

# Install all deps (needed to build packages + Next.js app)
RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile

# Build-time placeholder env (Zod validation runs at build, real values injected at runtime)
ENV DATABASE_URL=postgres://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-time-placeholder-secret-min-16-chars \
    BETTER_AUTH_URL=http://localhost:3000 \
    NODE_ENV=production

# Build workspace packages first (web depends on them), then the web app
RUN pnpm --filter @mybizone/domain build && \
    pnpm --filter @mybizone/config build && \
    pnpm --filter @mybizone/ui build && \
    pnpm --filter @mybizone/db build && \
    pnpm --filter @mybizone/storage build && \
    pnpm --filter @mybizone/pdf build && \
    pnpm --filter @mybizone/auth-config build && \
    pnpm --filter @mybizone/web build

# Runtime stage — slim image with built artifacts
FROM node:20-alpine

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && \
    corepack enable && corepack prepare pnpm@9.12.0 --activate && \
    apk add --no-cache dumb-init

# Copy installed deps + built artifacts from builder
COPY --from=builder --chown=nodejs:nodejs /app /app

# Storage volume mount point
RUN mkdir -p storage && chown -R nodejs:nodejs /app/storage

USER nodejs

WORKDIR /app/apps/web

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => {if (r.statusCode >= 500) throw new Error(r.statusCode)})" || exit 1

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
