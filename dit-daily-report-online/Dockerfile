FROM node:22.13.0-bookworm-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm install --global pnpm@11.9.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

FROM node:22.13.0-bookworm-slim AS runtime

ENV NODE_ENV="production"
ENV HOST="0.0.0.0"
ENV PORT="10000"
ENV NODE_OPTIONS="--max-old-space-size=256"

WORKDIR /app

COPY --from=builder /app/dist/standalone ./

EXPOSE 10000

CMD ["node", "server.js"]
