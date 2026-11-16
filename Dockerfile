FROM node:22.23.5-slim

WORKDIR /app
RUN npm install --global pnpm@10.34.9

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
ENV NODE_ENV=production
EXPOSE 8787
CMD ["pnpm", "start"]
