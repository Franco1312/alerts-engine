# Multi-stage Dockerfile for alerts-engine
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache tini curl dumb-init

# Set working directory
WORKDIR /app

# Use existing node user (non-root)

# Install dependencies stage
FROM base AS deps

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM base AS build

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Runtime stage
FROM base AS runtime

# Copy built application and production dependencies
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/rules ./rules

# Set ownership to non-root user
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Set production environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Use tini as init system
ENTRYPOINT ["tini", "--"]

# Start the application
CMD ["node", "dist/index.js"]
