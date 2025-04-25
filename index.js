require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { OpenAI } = require('openai');

// Проверка переменных окружения
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN не установлен в .env');
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY не установлен в .env');
  process.exit(1);
}

// Инициализация бота и OpenAI
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeText = `
👋 Привет! Я AI-ассистент для учителя английского. Я могу:

✓ Объяснять грамматику
✓ Проверять упражнения
✓ Придумывать примеры
✓ Помогать с переводом

Просто напиши свой вопрос!`;
  
  bot.sendMessage(chatId, welcomeText);
});

// Обработчик сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Игнорируем команды и пустые сообщения
  if (!text || text.startsWith('/')) return;

  try {
    // Показываем индикатор "печатает"
    await bot.sendChatAction(chatId, 'typing');

    // Запрос к OpenAI
    const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { 
            role: "system", 
            content: `Ты — дружелюбный учитель английского для подростков. Твоя задача:
      1. Исправь ошибки в предложении пользователя (если они есть) и покажи правильный вариант
      2. Объясни правило, связанное с ошибкой, простыми словами
      3. Задай интересный вопрос по теме для продолжения диалога (на английском) + перевод вопроса на русский
      
      Формат ответа:
      ---
      ✅ Правильный вариант: [исправленное предложение]
      
      📖 Правило: [простое объяснение на русском]
      
      💬 Let's talk: [вопрос на английском]
      (Перевод: [перевод вопроса на русский])
      ---`
          },
          { role: "user", content: text }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

    const aiResponse = completion.choices[0]?.message?.content;
    
    if (aiResponse) {
      await bot.sendMessage(chatId, aiResponse);
    } else {
      throw new Error('Пустой ответ от OpenAI');
    }

  } catch (error) {
    console.error('Ошибка OpenAI:', error);
    
    let errorMessage = '⚠️ Произошла ошибка. Попробуйте позже!';
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        errorMessage = '🔑 Ошибка: Неверный API ключ OpenAI';
      } else if (error.status === 429) {
        errorMessage = '🌀 Слишком много запросов. Подождите 20 секунд.';
      }
    }
    
    await bot.sendMessage(chatId, errorMessage);
  }
});

// Обработчики ошибок
bot.on('polling_error', (error) => {
  console.error('Ошибка polling:', error.message);
});

process.on('unhandledRejection', (error) => {
  console.error('Необработанное исключение:', error);
});

console.log('🤖 Бот успешно запущен и готов к работе!');