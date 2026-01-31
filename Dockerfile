FROM node:22-bookworm-slim

# Установка дополнительных зависимостей для sharp (требуется для обработки изображений)
RUN apt-get update && apt-get install -y \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies
# Копируем только package.json сначала для лучшего кэширования слоев
COPY package.json ./
RUN npm install --production --no-audit --no-fund --prefer-offline --no-optional

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
