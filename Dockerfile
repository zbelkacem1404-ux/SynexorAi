FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install all dependencies (including devDependencies for tsx and build tools)
RUN npm run install:all

# Copy source code
COPY . .

# Build client
RUN npm --prefix client run build

# Build server
RUN npm --prefix server run build

# Run the FULL seed (creates users, suppliers, routes, route plans, contacts, etc.)
RUN cd server && npx tsx scripts/seed.ts

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "server/dist/index.js"]
