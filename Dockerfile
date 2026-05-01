FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Strip the npm/npx CLI bundled in node:alpine. The standalone Next.js
# server runs with `node server.js` and never needs npm at runtime, so we
# drop the toolchain to shrink the image and remove the upstream HIGH/CRITICAL
# CVEs that npm's bundled deps (tar, minimatch, glob, cross-spawn) carry.
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/bin/npm \
           /usr/local/bin/npx

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Drizzle reads migrations/meta/_journal.json at runtime (fs, not import), so
# Next's standalone tracer doesn't include the folder — must be COPY'd explicitly.
COPY --from=builder --chown=nextjs:nodejs /app/migrations ./migrations

USER nextjs

EXPOSE 3000

ENV PORT=3000
# Bind dual-stack (IPv6 + IPv4-mapped IPv6) so the server is reachable on both
# protocols inside a podman/docker network with `enable_ipv6: true`. With only
# `0.0.0.0`, the v6 AAAA record returned by aardvark-dns for the service name
# points to a port nothing is listening on, breaking Caddy → app on dual-stack
# networks. Linux defaults `IPV6_V6ONLY=0`, so `::` accepts v4 connections too.
ENV HOSTNAME="::"

CMD ["node", "server.js"]
