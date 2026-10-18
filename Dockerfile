FROM node:22-bookworm-slim

WORKDIR /app

# Install native compilation dependencies for C++ addons (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency specifications
COPY package*.json ./

# Install production dependencies cleanly
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Expose server port
EXPOSE 5000

ENV PORT=5000
ENV NODE_ENV=production

# Mount persistent storage for SQLite database & uploaded releases
VOLUME ["/app/data", "/app/uploads"]

CMD ["node", "src/server.js"]
