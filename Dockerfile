FROM node:20-bookworm-slim

# Установка минимальных системных зависимостей; libvips встроен в бинарники sharp
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies
# Копируем только package.json и lock для кеша
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --include=optional --no-audit --no-fund --prefer-offline

# Copy the rest of the source (исключая то, что в .dockerignore)
# Используем COPY . . для копирования всех файлов, но .dockerignore исключит ненужное
COPY . .

ENV NODE_ENV=production

# Создаем необходимые директории
RUN mkdir -p temp && \
    mkdir -p logs

# Проверяем, что основные файлы на месте
RUN test -f index.js || (echo "ERROR: index.js not found" && exit 1) && \
    test -f config.js || (echo "ERROR: config.js not found" && exit 1)

CMD ["npm", "start"]
