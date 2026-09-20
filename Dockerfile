# Production Dockerfile for BarberTurnos
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./
RUN npm ci

# Copy source code and build frontend + backend bundle
COPY . .
RUN npm run build

# Production Runner
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled bundles and persistent data directory
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data

# Expose default application port
EXPOSE 3000

# Start server
CMD ["node", "dist/server.cjs"]
