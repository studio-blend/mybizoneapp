FROM node:20-alpine

WORKDIR /app

# Create non-root user (before chown operations)
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Install pnpm + dumb-init
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate && apk add --no-cache dumb-init

# Copy package files for pnpm
COPY --chown=nodejs:nodejs package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy entire repo structure (will install deps with pnpm)
COPY --chown=nodejs:nodejs apps apps/
COPY --chown=nodejs:nodejs packages packages/

# Install all dependencies (needed for pnpm workspace hoisting)
RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile

# Create storage directory
RUN mkdir -p storage && chown -R nodejs:nodejs /app

# Switch to non-root
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["pnpm", "--filter", "@mybizone/web", "start"]
