FROM node:20-alpine

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source
COPY . .

# Expose server port
EXPOSE 5000

# Mount persistent storage for SQLite database & uploaded releases
VOLUME ["/app/data", "/app/uploads"]

CMD ["node", "src/server.js"]
