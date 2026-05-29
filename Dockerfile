# --- Stage 1: Build ---
FROM node:20-slim AS builder

# Install OpenSSL and network tools for Prisma and debugging
RUN apt-get update && apt-get install -y openssl iputils-ping curl && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .

# Generate Prisma Client (Required for build)
RUN npx prisma generate
RUN npm run build

# --- Stage 2: Production ---
FROM node:20-slim AS production

# Install OpenSSL and network tools for Prisma and debugging
RUN apt-get update && apt-get install -y openssl iputils-ping curl && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
COPY package*.json ./
# Install ALL dependencies (including dev tools for seeding)
RUN npm ci

# Copy build artifacts, generated Prisma client, migrations, and config
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/tsconfig.json ./tsconfig.json
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /usr/src/app/node_modules/@prisma/client ./node_modules/@prisma/client

EXPOSE 3001
CMD ["node", "dist/src/main"]
