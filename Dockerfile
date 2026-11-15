# YMT Group PWA – single container: Node serves the API and the built app.
# All business data lives in /data (mount a persistent volume there).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production PORT=3001 DATA_DIR=/data TRUST_PROXY=1
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/ shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --workspace server --include-workspace-root=false
COPY server/ server/
COPY --from=build /app/client/dist client/dist
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 3001
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/index.js"]
