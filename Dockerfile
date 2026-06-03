FROM node:20-slim

# Install system dependencies (needed for compiling sqlite3 if pre-built binary is not available, though prebuilt usually works)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency configs
COPY package*.json ./

# Install npm dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Set environment
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/database.sqlite
ENV LOG_LEVEL=info
ENV ALERT_API_URL=http://localhost:9000/api/alerts

# Expose port
EXPOSE 3000

# Run server
CMD ["node", "src/server.js"]
