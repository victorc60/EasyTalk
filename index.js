import 'dotenv/config';
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import { sequelize } from './database/database.js';
import logger from './utils/logger.js';
import { sessionManager } from './middlewares/sessionMiddleware.js';
import { botControllers } from './controllers/botControllers.js';
import { userServices } from './services/userServices.js';
import { setupScheduledTasks } from './services/schedule.js';

// Инициализация Express приложения (для вебхуков)
const app = express();
const PORT = process.env.PORT || 3000;

// Проверка обязательных переменных окружения
const requiredEnvVars = [
  'TELEGRAM_BOT_TOKEN',
  'OPENAI_API_KEY',
  'ADMIN_ID',
  'DB_NAME',
  'DB_USER',
  'DB_HOST'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Инициализация Telegram бота
function initializeBot() {
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: process.env.NODE_ENV !== 'production',
    webHook: process.env.NODE_ENV === 'production'
      ? { port: PORT, host: process.env.WEBHOOK_HOST }
      : false
  });

  // Настройка вебхука для production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.json());
    app.post(`/bot${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
      bot.processUpdate(req.body);
      res.sendStatus(200);
    });
  }

  return bot;
}

async function startApplication() {
  try {
    // 1. Инициализация базы данных
    await sequelize.authenticate();
    await sequelize.sync({ alter: process.env.NODE_ENV !== 'production' });
    logger.info('Database connected and synced');

    // 2. Инициализация бота
    const bot = initializeBot();
    
    // 3. Настройка контроллеров
    botControllers(bot);
    
    // 4. Запуск планировщика задач
    setupScheduledTasks(bot);
    
    // 5. Запуск сервера (для вебхуков)
    if (process.env.NODE_ENV === 'production') {
      app.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
        logger.info(`Webhook URL: https://${process.env.WEBHOOK_HOST}/bot${process.env.TELEGRAM_BOT_TOKEN}`);
      });
    } else {
      logger.info('Bot running in polling mode');
    }

    // 6. Отправка уведомления админу
    try {
      await bot.sendMessage(
        process.env.ADMIN_ID,
        `🟢 Бот запущен\n` +
        `⏰ Время сервера: ${new Date().toLocaleString('ru-RU')}\n` +
        `🔧 Режим: ${process.env.NODE_ENV || 'development'}`
      );
    } catch (adminError) {
      logger.error('Failed to send startup notification to admin', adminError);
    }

  } catch (error) {
    logger.error('Application startup failed:', error);
    process.exit(1);
  }
}

// Обработка ошибок процесса
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Запуск приложения
startApplication();

export { app }; // Для тестирования