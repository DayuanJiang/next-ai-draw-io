# Multi-stage Dockerfile for Next.js

# Stage 1: Install dependencies
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Stage 2: Build application
FROM node:24-alpine AS builder
WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build-time argument for self-hosted draw.io URL
ARG NEXT_PUBLIC_DRAWIO_BASE_URL=https://embed.diagrams.net
ENV NEXT_PUBLIC_DRAWIO_BASE_URL=${NEXT_PUBLIC_DRAWIO_BASE_URL}

# Build-time argument to show About link and Notice icon
ARG NEXT_PUBLIC_SHOW_ABOUT_AND_NOTICE=false
ENV NEXT_PUBLIC_SHOW_ABOUT_AND_NOTICE=${NEXT_PUBLIC_SHOW_ABOUT_AND_NOTICE}

# Build-time argument for subdirectory deployment (e.g., /nextaidrawio)
ARG NEXT_PUBLIC_BASE_PATH=""
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}

# Build Next.js application (standalone mode)
RUN npm run build

# Stage 3: Production runtime
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public

# Copy standalone build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application (HOSTNAME override needed for AWS App Runner)
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]

