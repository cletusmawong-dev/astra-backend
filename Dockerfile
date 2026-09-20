# Astra backend — Node 20 + python3 (for docx/xlsx/zip exporters)
FROM node:20-bookworm-slim

RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends python3 python3-pip \
 && pip3 install --no-cache-dir --break-system-packages python-docx openpyxl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install only the runtime dependency the server needs (tsx), skip dev/test weight
COPY package.json ./
RUN npm pkg delete dependencies.cloudflared dependencies.jsdom \
 && npm install --omit=dev

COPY server ./server
COPY public ./public

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node_modules/.bin/tsx", "server/main.ts"]
