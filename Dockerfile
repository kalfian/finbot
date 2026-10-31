FROM node:22.23.2-bookworm AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22.23.2-bookworm AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/package.json ./package.json
RUN mkdir -p /data && chown node:node /data
ENV DATABASE_PATH=/data/financial-tracker.db
USER node
EXPOSE 3000
CMD npm start -- --hostname 0.0.0.0
