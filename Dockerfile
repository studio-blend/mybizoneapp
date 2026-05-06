# Build stage
FROM node:20-alpine AS builder

WORKDIR /build

# Install pnpm
RUN npm install -g pnpm@9.12.0

# Copy root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all packages and apps (monorepo structure)
COPY packages ./packages
COPY apps ./apps

# Install dependencies (frozen lockfile in CI/prod)
RUN pnpm install --frozen-lockfile

# Build all packages + app
RUN pnpm build

# Runtime stage
FROM node:20-alpine AS runtime

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Install pnpm for prod
RUN npm install -g pnpm@9.12.0

# Copy built app (standalone mode outputs to .next and public)
COPY --from=builder --chown=nextjs:nodejs /build/apps/web/.next ./
COPY --from=builder --chown=nextjs:nodejs /build/apps/web/public ./public

# Copy root package.json (server.js may reference it)
COPY --chown=nextjs:nodejs package.json ./

# Create storage directory for local FS uploads (prod self-host)
RUN mkdir -p /app/storage && chown -R nextjs:nodejs /app/storage

# Switch to non-root
USER nextjs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Server runs standalone Next.js on port 3000
EXPOSE 3000
CMD ["node", "server.js"]
