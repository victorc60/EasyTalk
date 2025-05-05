import 'dotenv/config';
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import { sequelize } from './database/database.js';
import logger from './utils/logger.js';
import { sessionManager } from './middlewares/sessionMiddleware.js';
import setupBotControllers from './controllers/botControllers.js';

import { setupScheduledTasks } from './config/schedule.js';

// Инициализация Express
const app = express();
const PORT = process.env.PORT || 3000;

// Валидация переменных окружения
const validateEnvironment = () => {
  const requiredEnvVars = [
    'TELEGRAM_BOT_TOKEN',
    'OPENAI_API_KEY',
    'ADMIN_ID',
    'DB_NAME',
    'DB_USER',
    'DB_HOST'
  ];

  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    logger.error('Missing required environment variables:', missingVars);
    process.exit(1);
  }
};

// Инициализация бота с обработкой ошибок
const initializeBot = () => {
  try {
    const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
      polling: process.env.NODE_ENV !== 'production',
      webHook: process.env.NODE_ENV === 'production' ? { 
        port: PORT, 
        host: process.env.WEBHOOK_HOST 
      } : false,
      request: {
        timeout: 10000,
        agent: process.env.NODE_ENV === 'production' ? 
          new (require('https')).Agent({ keepAlive: true }) : null
      }
    });

    if (process.env.NODE_ENV === 'production') {
      app.use(express.json());
      app.post(`/bot${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
      });
    }

    return bot;
  } catch (error) {
    logger.error('Bot initialization failed:', error);
    process.exit(1);
  }
};

// Основная функция запуска
const startApplication = async () => {
    validateEnvironment();
  
    try {
      // 1. Инициализация базы данных
      await sequelize.authenticate();
      await sequelize.sync({ 
        alter: process.env.NODE_ENV !== 'production',
        logging: msg => logger.debug(msg)
      });
      logger.info('Database connected and synced');
  
      // 2. Инициализация бота
      const bot = initializeBot();
      
      // 3. Настройка контроллеров
      setupBotControllers(bot);
      
      // 4. Запуск планировщика задач
      setupScheduledTasks(bot);
      
      // 5. Запуск сервера
      if (process.env.NODE_ENV === 'production') {
        const server = app.listen(PORT, () => {
          logger.info(`Server running on port ${PORT}`);
        });
      }
  
      return { app, bot }; // Явно возвращаем объект с app и bot
    } catch (error) {
      logger.error('Application startup failed:', error);
      throw error; // Пробрасываем ошибку для обработки выше
    }
  };
  
  // Запуск приложения
  let appInstance, botInstance;
  
  try {
    const { app, bot } = await startApplication();
    appInstance = app;
    botInstance = bot;
  } catch (error) {
    logger.error('Fatal error during startup:', error);
    process.exit(1);
  }
  
  export { appInstance as app, botInstance as bot };