FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install all dependencies
RUN npm run install:all

# Copy source code
COPY . .

# Build client
RUN npm --prefix client run build

# Build server
RUN npm --prefix server run build

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

# Server auto-seeds on first run if no users exist
CMD ["node", "server/dist/index.js"]
