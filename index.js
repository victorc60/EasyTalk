require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Проверка наличия токенов перед началом работы
if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('❌ Ошибка: TELEGRAM_BOT_TOKEN не указан в файле .env');
    process.exit(1); // Завершаем выполнение программы
}

if (!process.env.GROK_API_KEY) {
    console.error('❌ Ошибка: GROK_API_KEY не указан в файле .env');
    process.exit(1); // Завершаем выполнение программы
}

// Инициализация Telegram бота
let bot;
try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    bot = new TelegramBot(botToken, { polling: true });
    console.log('✅ Telegram бот успешно инициализирован');
} catch (error) {
    console.error('❌ Ошибка при инициализации Telegram бота:', error.message);
    if (error.response && error.response.statusCode === 401) {
        console.error('❌ Проблема с TELEGRAM_BOT_TOKEN: неверный или неавторизованный токен');
    }
    process.exit(1); // Завершаем выполнение программы
}

// Grok API ключ
const grokApiKey = process.env.GROK_API_KEY;

// Приветственное сообщение для команды /start
bot.onText(/\/start/, (msg) => {
    try {
        const chatId = msg.chat.id;
        if (!chatId) {
            throw new Error('Не удалось определить chatId из сообщения');
        }
        bot.sendMessage(chatId, 'Привет! Я AI-ассистент, работающий на Grok 3. Напиши мне что-нибудь, и я отвечу! 😊');
        console.log(`ℹ️ Команда /start выполнена для chatId: ${chatId}`);
    } catch (error) {
        console.error('❌ Ошибка при обработке команды /start:', error.message);
    }
});

// Обработка текстовых сообщений
bot.on('message', async (msg) => {
    try {
        const chatId = msg.chat.id;
        const text = msg.text;

        if (!chatId) {
            throw new Error('Не удалось определить chatId из сообщения');
        }

        if (!text) {
            throw new Error('Сообщение пустое или не содержит текст');
        }

        // Игнорируем команды
        if (text.startsWith('/')) return;

        console.log(`ℹ️ Получено сообщение от chatId ${chatId}: ${text}`);

        // Отправляем запрос в Grok API
        const response = await axios.post('https://api.x.ai/v1/completions', {
            model: 'grok-beta',
            messages: [
                { role: 'system', content: 'You are a helpful AI assistant created by xAI.' },
                { role: 'user', content: text }
            ],
            max_tokens: 300
        }, {
            headers: {
                'Authorization': `Bearer ${grokApiKey}`,
                'Content-Type': 'application/json'
            }
        });

        // Проверка ответа от Grok API
        if (!response.data || !response.data.choices || !response.data.choices[0]) {
            throw new Error('Некорректный ответ от Grok API: структура данных не соответствует ожидаемой');
        }

        // Получаем ответ от Grok
        const grokResponse = response.data.choices[0].message.content;

        if (!grokResponse) {
            throw new Error('Ответ от Grok API пустой');
        }

        // Отправляем ответ пользователю
        await bot.sendMessage(chatId, grokResponse);
        console.log(`✅ Ответ отправлен chatId ${chatId}: ${grokResponse}`);

    } catch (error) {
        // Логирование ошибок
        if (error.response) {
            // Ошибка от Grok API (например, 401, 429 и т.д.)
            console.error('❌ Ошибка при запросе к Grok API:');
            console.error(`Статус: ${error.response.status}`);
            console.error(`Данные ошибки:`, error.response.data);
            if (error.response.status === 401) {
                console.error('❌ Проблема с GROK_API_KEY: неверный или неавторизованный ключ');
            } else if (error.response.status === 429) {
                console.error('❌ Д