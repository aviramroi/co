# Wingman agent — production image with Playwright + Chromium bundled, so live
# channel automation runs on a headless server out of the box. Logins are
# captured locally and imported (`wingman import-session` / the web upload), so
# the server never needs a display.
#
# Mock-only? You can swap the runtime base for `node:22-slim` for a much smaller
# image (Playwright is an optional dependency and is lazily imported).

FROM node:22-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --omit=optional --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.49.0-jammy AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    WINGMAN_HOST=0.0.0.0 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Prod deps incl. the optional `playwright` package; browsers already in the base.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist

EXPOSE 4600
# State (accounts, conversations, saved sessions) — mount a volume to persist it.
VOLUME ["/app/.wingman"]

CMD ["node", "dist/cli.js", "run"]
