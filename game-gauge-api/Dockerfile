FROM node:22-alpine

# Prisma requires openssl
RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma/ ./prisma/
RUN npm ci

# Copy source and build (prisma generate + tsc)
COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
