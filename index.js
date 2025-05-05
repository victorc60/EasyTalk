import 'dotenv/config';
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import sequelize from './database/database.js'; 
import logger from './utils/logger.js';
import { sessionManager } from './middlewares/sessionMiddleware.js';
import setupBotControllers from './controllers/botControllers.js';
import { setupScheduledTasks } from './config/schedule.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Переменная для хранения экземпляра бота
let bot;

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

const initializeBot = () => {
  try {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
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

async function startApplication() {
  validateEnvironment();

  try {
    await sequelize.authenticate();
    await sequelize.sync({ 
      alter: process.env.NODE_ENV !== 'production',
      logging: msg => logger.debug(msg)
    });
    logger.info('Database connected and synced');

    const botInstance = initializeBot();
    setupBotControllers(botInstance);
    setupScheduledTasks(botInstance);

    if (process.env.NODE_ENV === 'production') {
      app.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
      });
    }

    return { app, bot: botInstance };
  } catch (error) {
    logger.error('Application startup failed:', error);
    process.exit(1);
  }
}

// Экспортируем bot
export { bot };

startApplication()
  .then(({ app: appInstance, bot: botInstance }) => {
    // Экспорт для внешнего использования (если нужно)
  })
  .catch(err => {
    logger.error('Fatal startup error:', err);
    process.exit(1);
  });