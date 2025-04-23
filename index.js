require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Проверка наличия токенов
if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.GROK_API_KEY) {
    console.error('ERROR: Missing required tokens in .env file');
    process.exit(1);
}

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const grokApiKey = process.env.GROK_API_KEY;

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Привет! Я AI-ассистент, работающий на Grok. Напиши мне что-нибудь, и я отвечу! 😊');
    console.log(`/start command from chatId: ${chatId}`);
});

bot.on('message', async (msg) => {
    try {
        const chatId = msg.chat.id;
        const text = msg.text;

        if (!text || text.startsWith('/')) return;

        console.log(`Received message from ${chatId}: ${text}`);

        // Формируем запрос к Grok API
        const response = await axios.post('https://api.x.ai/v1/completions', {
            model: 'grok-1',
            prompt: text,
            max_tokens: 300,
            temperature: 0.7
        }, {
            headers: {
                'Authorization': `Bearer ${grokApiKey}`,
                'Content-Type': 'application/json'
            }
        });

        // Получаем ответ (проверяем разные возможные форматы)
        const grokResponse = response.data.choices?.[0]?.text || 
                            response.data.choices?.[0]?.message?.content || 
                            'Не получилось обработать ответ.';

        await bot.sendMessage(chatId, grokResponse);
        console.log(`Sent response to ${chatId}: ${grokResponse}`);

    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
        
        let errorMessage = 'Произошла ошибка. Попробуйте позже!';
        if (error.response) {
            if (error.response.status === 401) {
                errorMessage = 'Ошибка авторизации. Проверьте API ключ.';
            } else if (error.response.status === 429) {
                errorMessage = 'Слишком много запросов. Подождите немного.';
            }
        }
        
        bot.sendMessage(msg.chat.id, errorMessage);
    }
});

// Обработчики ошибок
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});

console.log('Bot started and ready...'););