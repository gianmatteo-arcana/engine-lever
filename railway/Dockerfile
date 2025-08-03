# Use the official Node.js 18 image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Remove development dependencies and source files to reduce image size
RUN rm -rf src/ tsconfig.json

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S railway -u 1001
USER railway

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]