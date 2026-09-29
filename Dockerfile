FROM node:20-alpine

WORKDIR /app

RUN corepack enable \
    && corepack prepare pnpm@9.6.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]
