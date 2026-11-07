# The API. Build from the repository root, because it needs the shared package too:
#   docker build -f apps/api/Dockerfile -t shikshya-api .

FROM node:20-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
# Chrome comes from Debian in the final image, so Puppeteer need not download its own.
ENV PUPPETEER_SKIP_DOWNLOAD=1
COPY . .
RUN pnpm install --frozen-lockfile --filter "@shikshya/api..."
RUN pnpm --filter @shikshya/shared build
RUN pnpm --filter @shikshya/api build
# A folder with only what production needs: no dev dependencies and no source code.
RUN pnpm --filter @shikshya/api deploy --legacy --prod /app

FROM node:20-bookworm-slim
# Chrome makes the PDFs, with fonts that include Devanagari. Prisma needs OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-noto-core openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# Lighter on memory. The sandbox needs privileges containers do not have, and scripts are off anyway.
ENV PUPPETEER_ARGS="--no-sandbox --disable-dev-shm-usage --disable-gpu --no-zygote"
WORKDIR /app
COPY --from=build /app .
RUN npx prisma generate
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 4000
# Migrations run first on every start, so the code and the database cannot get out of step. A failed
# migration stops the new version from starting, and the old one keeps serving.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/index.js"]
