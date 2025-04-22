require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Проверка наличия токенов перед началом работы
if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('ERROR: TELEGRAM_BOT_TOKEN is not set in .env file');
    process.exit(1);
}

if (!process.env.GROK_API_KEY) {
    console.error('ERROR: GROK_API_KEY is not set in .env file');
    process.exit(1);
}

let bot;
try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    bot = new TelegramBot(botToken, { polling: true });
    console.log('Telegram bot initialized successfully');
} catch (error) {
    console.error('ERROR initializing Telegram bot:', error.message);
    if (error.response && error.response.statusCode === 401) {
        console.error('ERROR with TELEGRAM_BOT_TOKEN: Invalid or unauthorized token');
    }
    process.exit(1);
}

const grokApiKey = process.env.GROK_API_KEY;

bot.onText(/\/start/, (msg) => {
    try {
        const chatId = msg.chat.id;
        if (!chatId) {
            throw new Error('Unable to determine chatId from message');
        }
        bot.sendMessage(chatId, 'Привет! Я AI-ассистент, работающий на Grok 3. Напиши мне что-нибудь, и я отвечу! 😊');
        console.log(`INFO: /start command executed for chatId: ${chatId}`);
    } catch (error) {
        console.error('ERROR processing /start command:', error.message);
    }
});

bot.on('message', async (msg) => {
    try {
        const chatId = msg.chat.id;
        const text = msg.text;

        if (!chatId) {
            throw new Error('Unable to determine chatId from message');
        }

        if (!text) {
            throw new Error('Message is empty or contains no text');
        }

        if (text.startsWith('/')) return;

        console.log(`INFO: Received message from chatId ${chatId}: ${text}`);

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

        if (!response.data || !response.data.choices || !response.data.choices[0]) {
            throw new Error('Invalid response from Grok API: Data structure does not match expected format');
        }

        const grokResponse = response.data.choices[0].message.content;

        if (!grokResponse) {
            throw new Error('Response from Grok API is empty');
        }

        await bot.sendMessage(chatId, grokResponse);
        console.log(`SUCCESS: Response sent to chatId ${chatId}: ${grokResponse}`);

    } catch (error) {
        if (error.response) {
            console.error('ERROR requesting Grok API:');
            console.error(`Status: ${error.response.status}`);
            console.error(`Error details:`, error.response.data);
            if (error.response.status === 401) {
                console.error('ERROR with GROK_API_KEY: Invalid or unauthorized key');
            } else if (error.response.status === 429) {
                console.error('ERROR: Grok API rate limit reached (1 request per second or 60/1200 per hour)');
            }
            bot.sendMessage(msg.chat.id, 'Произошла ошибка при общении с Grok API. Попробуй снова позже!');
        } else if (error.message.includes('chatId')) {
            console.error('LOGICAL ERROR:', error.message);
        } else if (error.message.includes('empty')) {
            console.error('LOGICAL ERROR:', error.message);
            bot.sendMessage(msg.chat.id, 'Пожалуйста, отправь текстовое сообщение!');
        } else {
            console.error('UNKNOWN ERROR:', error.message);
            bot.sendMessage(msg.chat.id, 'Произошла неизвестная ошибка. Попробуй снова позже!');
        }
    }
});

bot.on('polling_error', (error) => {
    console.error('ERROR in Telegram API polling:', error.message);
    if (error.code === 'ETELEGRAM') {
        console.error('ERROR: Check TELEGRAM_BOT_TOKEN or internet connection');
    }
});

process.on('uncaughtException', (error) => {
    console.error('UNEXPECTED ERROR:', error.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED PROMISE REJECTION:', reason);
});

console.log('Bot started...');