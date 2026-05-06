FROM node:20-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Install pnpm + dumb-init
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate && apk add --no-cache dumb-init

# Copy root package files for pnpm to work
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy pre-built Next.js and packages (assumes `pnpm build` ran on host)
COPY apps/web/.next apps/web/.next
COPY apps/web/package.json apps/web/
COPY packages packages/
COPY node_modules node_modules/

# Create storage directory
RUN mkdir -p storage && chown -R nodejs:nodejs /app

# Switch to non-root
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["pnpm", "--filter", "@mybizone/web", "start"]
