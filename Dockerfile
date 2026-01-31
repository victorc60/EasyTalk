FROM node:22-bookworm-slim

# Установка дополнительных зависимостей для sharp (требуется для обработки изображений)
RUN apt-get update && apt-get install -y \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies
# Проверяем наличие package-lock.json, если его нет - используем npm install
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then \
        npm ci --omit=dev --no-audit --no-fund || npm install --production --no-audit --no-fund; \
    else \
        npm install --production --no-audit --no-fund; \
    fi

# Copy the rest of the source (исключая то, что в .dockerignore)
COPY . .

ENV NODE_ENV=production

# Создаем необходимые директории
RUN mkdir -p temp && \
    mkdir -p logs

# Проверяем, что основные файлы на месте
RUN test -f index.js || (echo "ERROR: index.js not found" && exit 1) && \
    test -f config.js || (echo "ERROR: config.js not found" && exit 1)

CMD ["npm", "start"]
