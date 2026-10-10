# The MCP App server (projects/mcp-app) over stdio, for registries that start
# the server and introspect it (Glama).
#
# The build stage builds both packages and the view, then bundles the server
# together with its dependencies, so the runtime image holds two files.
FROM node:22-slim AS build
ENV CI=true NG_CLI_ANALYTICS=false
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:lib && npm run build:material && npm run build:mcp-app
# Some CommonJS dependencies call require(); give the ESM bundle one.
RUN npx esbuild dist/mcp-app/server.mjs --bundle --platform=node --target=node22 --format=esm \
      --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" \
      --outfile=/out/server.mjs --log-level=warning \
 && cp dist/mcp-app/view.html /out/

FROM node:22-slim
WORKDIR /app
COPY --from=build /out/ ./
USER node
ENTRYPOINT ["node", "server.mjs"]
