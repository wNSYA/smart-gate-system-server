# --- Stage 1: Build ---
# Use the lightweight Alpine Linux version of Node
FROM node:20-alpine AS builder

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy only the package files first to cache dependencies
COPY package*.json ./

# Install ALL dependencies (including devDependencies like TypeScript)
RUN npm ci

# Copy the rest of the application code
COPY . .

# Compile the NestJS application from TypeScript to JavaScript
RUN npm run build


# --- Stage 2: Production ---
FROM node:20-alpine AS production

# Set the working directory
WORKDIR /usr/src/app

# Copy the package files again
COPY package*.json ./

# Install ONLY production dependencies (keeps the image small)
RUN npm ci --omit=dev

# Copy the compiled JavaScript from the 'builder' stage
COPY --from=builder /usr/src/app/dist ./dist

# Expose the port your NestJS app runs on
EXPOSE 3000

# Start the application using the compiled JavaScript
CMD ["node", "dist/main"]