// index.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import { OpenAI } from 'openai';
import sequelize from './database/database.js';
import { sendAdminMessage } from './utils/botUtils.js';
import { setupBot } from './botSetup.js';
import { startBossGrammarWebhook } from './services/bossGrammarWebhook.js';
import './models/WordGameParticipation.js'; // Import to initialize the model
import './models/DailyWordGame.js';
import './models/Poll.js';
import './models/PollDelivery.js';
import './models/PollResponse.js';
import './models/MiniEventDay.js';
import './models/MiniEventParticipant.js';
import './models/MiniEventResponse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(express.json());

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  console.error('TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}

const webhookPath = `/telegram/webhook/${botToken}`;
const webhookBase = process.env.TELEGRAM_WEBHOOK_URL || process.env.WEBHOOK_DOMAIN;
const webhookUrl = webhookBase ? `${webhookBase.replace(/\/$/, '')}${webhookPath}` : null;
const usePolling = !webhookUrl;

if (!webhookUrl) {
  console.warn('TELEGRAM_WEBHOOK_URL or WEBHOOK_DOMAIN is not configured; falling back to polling.');
}

// Создаём бота без автозапуска polling, чтобы не конкурировать с другим экземпляром (409)
// и не вызывать getUpdates до готовности приложения (БД, setup). Polling запустим ниже после init.
const bot = new TelegramBot(botToken, { polling: false });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const userSessions = {
  wordGames: new Map(),
  idiomGames: new Map(),
  phrasalVerbGames: new Map(),
  quizGames: new Map(),
  factGames: new Map(),
  activeDialogs: new Map(),
  conversationModes: new Map(),
  pollDrafts: new Map(),
  broadcastPending: false,
  broadcastContent: { text: null, photo: null } // Для хранения текста и URL картинки
};

if (webhookUrl) {
  app.post(webhookPath, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });
}

// Повторные попытки подключения к БД (удобно при старте на Railway, когда MySQL ещё поднимается)
const DB_RETRY_ATTEMPTS = Number(process.env.DB_RETRY_ATTEMPTS) || 10;
const DB_RETRY_DELAY_MS = Number(process.env.DB_RETRY_DELAY_MS) || 5000;

async function initializeDatabase() {
  for (let attempt = 1; attempt <= DB_RETRY_ATTEMPTS; attempt++) {
    try {
      await sequelize.authenticate();
      await sequelize.sync({ alter: true });
      console.log('✅ База данных подключена');
      return;
    } catch (error) {
      console.error(`❌ БД попытка ${attempt}/${DB_RETRY_ATTEMPTS}:`, error.message);
      if (attempt === DB_RETRY_ATTEMPTS) {
        console.error('❌ Не удалось подключиться к базе данных после всех попыток');
        process.exit(1);
      }
      console.log(`⏳ Повтор через ${DB_RETRY_DELAY_MS / 1000} сек...`);
      await new Promise((r) => setTimeout(r, DB_RETRY_DELAY_MS));
    }
  }
}

process.on('SIGTERM', async () => {
  console.log('Получен сигнал SIGTERM. Завершаем работу...');
  try {
    bot.stopPolling?.();
    await sendAdminMessage(bot, '🛑 Бот останавливается (SIGTERM)');
    await sequelize.close();
    console.log('Соединение с базой данных закрыто');
    process.exit(0);
  } catch (error) {
    console.error('Ошибка при завершении работы:', error);
    process.exit(1);
  }
});

process.on('unhandledRejection', (error) => {
  console.error('Необработанная ошибка:', error);
  sendAdminMessage(bot, `‼️ Критическая ошибка: ${error.message}`)
    .catch(err => console.error('Не удалось отправить сообщение об ошибке:', err));
});

(async () => {
  try {
    await initializeDatabase();
    await setupBot(bot, userSessions, openai);

    if (webhookUrl) {
      await bot.setWebHook(webhookUrl, { drop_pending_updates: true });
      console.log(`Webhook set to ${webhookUrl}`);
    }

    startBossGrammarWebhook(bot, app);

    const port = Number(process.env.PORT || 3000);
    app.get('/health', (req, res) => res.json({ ok: true }));
    const server = app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });

    if (usePolling) {
      bot.startPolling();
      console.log('Polling запущен (убедитесь, что не работает другой экземпляр этого бота).');
    }
    if (webhookUrl) {
      await sendAdminMessage(bot, `🟢 Бот запущен (webhook)\n🔗 ${webhookUrl}\n⏰ Время сервера: ${new Date().toLocaleString()}`);
    } else {
      await sendAdminMessage(bot, `🟢 Бот запущен (polling)\n⏰ Время сервера: ${new Date().toLocaleString()}`);
    }
  } catch (error) {
    console.error('Ошибка запуска:', error);
    await sendAdminMessage(bot, `‼️ Ошибка запуска бота: ${error.message}`)
      .catch(err => console.error('Не удалось отправить сообщение админу:', err));
    process.exit(1);
  }
})();
