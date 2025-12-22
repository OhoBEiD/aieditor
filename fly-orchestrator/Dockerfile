FROM node:20-slim

# Install git (required for operations)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create workspaces directory
RUN mkdir -p /workspaces

# Expose port
EXPOSE 3001

# Set environment
ENV PORT=3001
ENV WORKSPACES_DIR=/workspaces

CMD ["npm", "start"]
