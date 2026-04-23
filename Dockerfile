FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies needed for TypeScript build)
RUN npm install

# Copy source and config
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript → dist/
RUN npm run build

# Remove dev dependencies after build to keep image lean
RUN npm prune --production

EXPOSE 3000

CMD ["node", "dist/index.js"]
