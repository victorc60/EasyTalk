import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { OpenAI } from 'openai';
import schedule from 'node-schedule';
import sequelize from './database/database.js';
import User from './models/User.js';

// Проверка переменных окружения
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN не установлен в .env');
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY не установлен в .env');
  process.exit(1);
}

if (!process.env.ADMIN_ID) {
  console.error('ERROR: ADMIN_ID не установлен в .env');
  process.exit(1);
}

// Инициализация бота и OpenAI
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Синхронизация моделей с базой данных
(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Соединение с базой данных успешно установлено');
    await sequelize.sync({ force: false });
    console.log('✅ Таблицы синхронизированы с базой данных');
  } catch (error) {
    console.error('❌ Ошибка подключения к базе данных:', error);
  }
})();

// Генерация факта через OpenAI
async function generateDailyFact() {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `Generate an interesting fact about English language in English and provide Russian translation. Format:
          🇬🇧 [fact in English]
          🇷🇺 [translation in Russian]`
        }
      ],
      temperature: 0.8,
      max_tokens: 100
    });

    const fact = completion.choices[0]?.message?.content;
    if (!fact) throw new Error('Empty response from OpenAI');
    
    console.log('✅ Факт сгенерирован:', fact);
    return fact;
  } catch (error) {
    console.error('❌ Ошибка генерации факта:', error);
    // Запасной факт
    return `🇬🇧 The shortest English sentence is "I am."
🇷🇺 Самое короткое предложение в английском: "I am."`;
  }
}

// Функция рассылки
async function sendDailyFactToAllUsers() {
  console.log('⏳ Начало ежедневной рассылки...');
  
  try {
    const fact = await generateDailyFact();
    const users = await User.findAll();
    
    console.log(`📊 Найдено пользователей: ${users.length}`);

    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      try {
        // Используем bot.sendMessage вместо bot.telegram.sendMessage
        await bot.sendMessage(user.telegram_id, fact);
        successCount++;
        
        // Обновляем время последней активности
        await user.update({ last_activity: new Date() });
        
        // Задержка для избежания ограничений API (1 сообщение в секунду)
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        failCount++;
        console.error(`❌ Ошибка отправки для ${user.telegram_id}:`, error.message);
        
        // Удаляем заблокировавших бота
        if (error.response?.statusCode === 403) {
          await user.destroy();
          console.log(`🚮 Удалён неактивный пользователь: ${user.telegram_id}`);
        }
      }
    }

    console.log(`✅ Рассылка завершена. Успешно: ${successCount}, Не удалось: ${failCount}`);
    
    // Отправляем отчет админу
    await bot.sendMessage(
      process.env.ADMIN_ID,
      `📊 Ежедневная рассылка завершена\n` +
      `✅ Успешно: ${successCount}\n` +
      `❌ Не удалось: ${failCount}`
    );
  } catch (error) {
    console.error('❌ Фатальная ошибка рассылки:', error);
    await bot.sendMessage(process.env.ADMIN_ID, `❌ Ошибка рассылки: ${error.message}`);
  }
}

// Настройка ежедневной рассылки в 16:30 по Кишиневу
const job = schedule.scheduleJob(
  { hour: 16, minute: 30, tz: 'Europe/Chisinau' },
  sendDailyFactToAllUsers
);
console.log(`⏰ Рассылка настроена на 16:30 по Кишиневу`);

// Команда для тестирования рассылки
bot.onText(/\/test_fact/, async (msg) => {
  if (msg.from.id.toString() !== process.env.ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, '⛔ У вас нет прав на эту команду');
  }
  
  await bot.sendMessage(msg.chat.id, '🔄 Запуск тестовой рассылки...');
  await sendDailyFactToAllUsers();
});

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || null;

  try {
    const [user] = await User.findOrCreate({
      where: { telegram_id: chatId },
      defaults: {
        username,
        first_activity: new Date(),
        last_activity: new Date()
      }
    });
    
    if (!user.isNewRecord) {
      await user.update({ last_activity: new Date() });
    }
    
    console.log(`👤 Пользователь ${chatId} ${user.isNewRecord ? 'добавлен' : 'обновлен'}`);
  } catch (error) {
    console.error('❌ Ошибка при обработке /start:', error);
  }

  const welcomeText = `👋 Привет! Я буду присылать тебе ежедневные факты об английском в 16:30.`;
  await bot.sendMessage(chatId, welcomeText);
});

// Обработчик обычных сообщений
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  try {
    await bot.sendChatAction(msg.chat.id, 'typing');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `Ты — учитель английского. Формат ответа:
✅ Правильный вариант: [текст]
📖 Правило: [объяснение]
💬 Вопрос: [вопрос на английском]
(Перевод: [перевод])`
        },
        { role: 'user', content: msg.text }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const response = completion.choices[0]?.message?.content;
    await bot.sendMessage(msg.chat.id, response || 'Не получилось сгенерировать ответ');
  } catch (error) {
    console.error('❌ Ошибка обработки сообщения:', error);
    await bot.sendMessage(msg.chat.id, '⚠️ Произошла ошибка при обработке запроса');
  }
});

// Обработчики ошибок
bot.on('polling_error', (error) => {
  console.error('❌ Ошибка polling:', error.message);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Необработанное исключение:', error);
});

console.log('🤖 Бот успешно запущен и готов к работе!');