# syntax=docker/dockerfile:1
# Multi-stage: dev / build / prod (backend + static frontend)

# ---- deps ----
FROM node:22.12-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package*.json ./
RUN npm ci

# ---- build (frontend) ----
FROM deps AS build
COPY . .
RUN npm run build

# ---- build (server) ----
FROM deps AS server-build
COPY server ./server
COPY tsconfig*.json ./
RUN npx tsc -p tsconfig.server.json

# ---- dev (vite / api) ----
FROM deps AS dev
WORKDIR /app
EXPOSE 5173 8080
CMD ["npm", "run", "dev"]

# ---- prod ----
FROM node:22.12-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
RUN apk add --no-cache vips
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
COPY --from=server-build /app/dist/server ./dist/server
EXPOSE 8080
CMD ["node", "dist/server/index.js"]
