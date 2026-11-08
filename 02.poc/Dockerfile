FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 静的ファイルの配信とオンライン対戦（WebSocket）を1つのNodeプロセスで提供する。
FROM node:26-alpine
ENV NODE_ENV=production PORT=8090 STATIC_DIR=/app/dist
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
USER node
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8090/healthz || exit 1
CMD ["node", "dist-server/index.js"]
