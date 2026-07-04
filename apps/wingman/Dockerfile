# Wingman agent — deployable container.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --omit=optional --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Install prod deps only. Playwright is optional; add it in the image only if
# you run channels in `live` mode (and then `npx playwright install chromium`).
COPY package.json ./
RUN npm install --omit=dev --omit=optional --no-audit --no-fund
COPY --from=build /app/dist ./dist

# Control panel port
EXPOSE 4600
ENV WINGMAN_HOST=0.0.0.0

# State (conversations, approvals, sessions) — mount a volume to persist it.
VOLUME ["/app/.wingman"]

CMD ["node", "dist/cli.js", "run"]
