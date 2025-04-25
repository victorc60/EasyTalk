require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { OpenAI } = require('openai');
const cron = require('node-cron');
const User = require('./models/User'); // путь к модели

// Проверка переменных окружения
if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.OPENAI_API_KEY) {
  console.error('❌ Необходимые переменные окружения не заданы');
  process.exit(1);
}

// Инициализация
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log('🤖 Бот успешно запущен и готов к работе!');

// Функция генерации факта
async function generateFact() {
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo-0125",
    messages: [
      {
        role: "system",
        content: `Ты помогаешь учить английский. Сгенерируй 1 интересный факт на английском языке и его перевод на русский. Формат:
🇬🇧 Fact: [факт]
🇷🇺 Перевод: [перевод]`
      }
    ],
    temperature: 0.7,
    max_tokens: 200
  });

  return completion.choices[0]?.message?.content;
}

// Команда /start
bot.onText(/\/start/, async (msg) => {
  try {
    const { id, username } = msg.from;

    const [user, created] = await User.upsert({
      telegram_id: id,
      username: username || null,
      last_activity: new Date()
    });

    const welcomeMessage = created
      ? '✅ Вы успешно зарегистрированы! Буду присылать ежедневные факты.'
      : '🔄 Ваши данные обновлены! Продолжаем работу.';

    await bot.sendMessage(id, welcomeMessage);
    console.log(`Пользователь ${id} ${created ? 'добавлен' : 'обновлен'}`);
  } catch (error) {
    console.error('Ошибка при регистрации:', error);
    await bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при регистрации');
  }

  const chatId = msg.chat.id;
  const welcomeText = `
👋 Привет! Я AI-ассистент для учителя английского. Я могу:

✓ Объяснять грамматику  
✓ Проверять упражнения  
✓ Придумывать примеры  
✓ Помогать с переводом  

Просто напиши свой вопрос!`;

  await bot.sendMessage(chatId, welcomeText);
});

// Обработка обычных сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith('/')) return;

  try {
    await bot.sendChatAction(chatId, 'typing');

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125",
      messages: [
        {
          role: "system",
          content: `Ты — дружелюбный учитель английского для подростков. Твоя задача:
1. Исправь ошибки в предложении пользователя (если они есть) и покажи правильный вариант  
2. Объясни правило, связанное с ошибкой, простыми словами  
3. Задай интересный вопрос по теме для продолжения диалога (на английском) + перевод на русский  

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
      if (error.status === 401) errorMessage = '🔑 Ошибка: Неверный API ключ OpenAI';
      else if (error.status === 429) errorMessage = '🌀 Слишком много запросов. Подождите немного.';
    }

    await bot.sendMessage(chatId, errorMessage);
  }
});

// Команда /fact — отправка факта вручную
bot.onText(/\/fact/, async (msg) => {
  const chatId = msg.chat.id;
  const fact = await generateFact();
  await bot.sendMessage(chatId, `📘 *Fact of the day:*\n\n${fact}`, { parse_mode: "Markdown" });
});

// Ежедневная рассылка
cron.schedule('0 9 * * *', async () => {
  console.log('🚀 Запуск рассылки факта...');

  try {
    const users = await User.findAll();
    const fact = await generateFact();

    for (const user of users) {
      try {
        await bot.sendMessage(user.telegram_id, `📘 *Fact of the day:*\n\n${fact}`, { parse_mode: "Markdown" });
      } catch (err) {
        console.error(`Ошибка отправки пользователю ${user.telegram_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Ошибка рассылки:', err);
  }
});

// Обработчики ошибок
bot.on('polling_error', (error) => {
  console.error('Ошибка polling:', error.message);
});
process.on('unhandledRejection', (error) => {
  console.error('Необработанное исключение:', error);
});
