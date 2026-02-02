# Build and run with Bun for Dokku (or any Docker host)
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies (root + dashboard workspace)
COPY package.json bun.lock* ./
COPY dashboard/package.json dashboard/
RUN bun install --frozen-lockfile

# Copy source
COPY src ./src
COPY tsconfig.json ./
COPY dashboard ./dashboard

# Build dashboard and typecheck
RUN bun run build

# Production: run server (serves dashboard from dashboard/dist, uses PORT from env)
ENV NODE_ENV=production
EXPOSE 4108
CMD ["bun", "run", "start"]
