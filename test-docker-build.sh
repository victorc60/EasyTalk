#!/bin/bash

# Скрипт для локального тестирования Docker образа (опционально)
# Использование: ./test-docker-build.sh

echo "🔨 Тестирование сборки Docker образа..."

# Проверка наличия Docker
if ! command -v docker &> /dev/null; then
    echo "⚠️  Docker не установлен. Это нормально - для деплоя он не нужен."
    echo "📝 Но если хотите протестировать локально, установите Docker Desktop:"
    echo "   https://www.docker.com/products/docker-desktop"
    exit 0
fi

echo "✅ Docker найден"
echo ""

# Сборка образа
echo "📦 Сборка образа..."
docker build -t easytalk-bot-test .

if [ $? -eq 0 ]; then
    echo "✅ Сборка успешна!"
    echo ""
    echo "💡 Для запуска контейнера локально используйте:"
    echo "   docker run --env-file .env easytalk-bot-test"
    echo ""
    echo "⚠️  Убедитесь, что файл .env существует и содержит все необходимые переменные"
else
    echo "❌ Ошибка при сборке"
    exit 1
fi

