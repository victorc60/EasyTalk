// index.js
import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { OpenAI } from 'openai';
import sequelize from './database/database.js';
import { sendAdminMessage } from './utils/botUtils.js';
import { setupBot } from './botSetup.js';
import './models/WordGameParticipation.js'; // Import to initialize the model
import './models/DailyWordGame.js';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


const userSessions = {
  wordGames: new Map(),
  activeDialogs: new Map(),
  conversationModes: new Map(),
  broadcastPending: false,
  broadcastContent: { text: null, photo: null } // Для хранения текста и URL картинки
};

async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    console.log('✅ База данных подключена');
  } catch (error) {
    console.error('❌ Ошибка базы данных:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  console.log('Получен сигнал SIGTERM. Завершаем работу...');
  try {
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
    await sendAdminMessage(bot, `🟢 Бот запущен\n⏰ Время сервера: ${new Date().toLocaleString()}`);
  } catch (error) {
    console.error('Ошибка запуска:', error);
    await sendAdminMessage(bot, `‼️ Ошибка запуска бота: ${error.message}`)
      .catch(err => console.error('Не удалось отправить сообщение админу:', err));
    process.exit(1);
  }
})();
