import { sessionManager } from '../middlewares/sessionMiddleware.js';
import { contentGenerators } from '../services/contentGenerators.js';
import { userServices } from '../services/userServices.js';
import { gameServices } from '../services/gameServices.js';
import logger from '../utils/logger.js';


export default function(bot) {
  // Обработчик команды /start
  bot.onText(/\/start/, async (msg) => {
    try {
      const user = await userServices.findOrCreateUser(msg.chat.id, {
        username: msg.from.username,
        firstName: msg.from.first_name,
        lastName: msg.from.last_name
      });

      const welcomeMessage = `
👋 <b>Привет, ${msg.from.first_name || 'друг'}!</b> Я твой помощник в изучении английского.

📌 <b>Доступные режимы:</b>
1. <b>Свободное общение</b> - просто пиши мне на английском
2. <b>Ролевые игры</b> (/roleplay) - общайся с разными персонажами
3. <b>Проверка ошибок</b> (/correction) - я исправлю твои ошибки

🎮 <b>Активности:</b>
🔤 /wordgame - Слово дня
📚 /dailyfact - Интересный факт
💬 /topic - Тема для обсуждения

📊 /progress - Твой прогресс
🏆 /leaders - Таблица лидеров`;

      await bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: 'HTML' });
      logger.info(`New user started: ${msg.chat.id}`);
    } catch (error) {
      logger.error(`Start command error: ${error.message}`);
      bot.sendMessage(msg.chat.id, '⚠️ Произошла ошибка при запуске. Пожалуйста, попробуйте позже.');
    }
  });

  // Обработчик команды /roleplay
  bot.onText(/\/roleplay/, async (msg) => {
    await gameServices.startRolePlay(bot, msg.chat.id);
  });

  // Обработчик команды /wordgame
  bot.onText(/\/wordgame/, async (msg) => {
    await gameServices.startWordGame(bot, msg.chat.id);
  });

  // Обработчик команды /dailyfact
  bot.onText(/\/dailyfact/, async (msg) => {
    const fact = await contentGenerators.dailyFact();
    await bot.sendMessage(msg.chat.id, fact);
  });

  // Обработчик команды /topic
  bot.onText(/\/topic/, async (msg) => {
    const topic = await contentGenerators.conversationTopic();
    let message = `💬 <b>Тема:</b> ${topic.topic}\n\n<b>Вопросы:</b>\n`;
    topic.questions.forEach((q, i) => message += `${i+1}. ${q}\n`);
    message += `\n<b>Словарь:</b>\n`;
    topic.vocabulary.forEach((v, i) => message += `${i+1}. ${v.word} - ${v.translation}\n`);
    await bot.sendMessage(msg.chat.id, message, { parse_mode: 'HTML' });
  });

  // Обработчик обычных сообщений
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    try {
      // Проверка игры "Угадай слово"
      if (await gameServices.checkWordGameAnswer(bot, msg.chat.id, msg.text)) {
        return;
      }

      // Обработка ролевой игры
      if (sessionManager.getDialog(msg.chat.id)) {
        await gameServices.handleRolePlayMessage(bot, msg.chat.id, msg.from.id, msg.text);
        return;
      }

      // Стандартная обработка сообщения
      const mode = sessionManager.getMode(msg.from.id);
      let response;

      if (mode === 'correction') {
        response = await contentGenerators.correctText(msg.text);
      } else {
        response = await contentGenerators.generateResponse(msg.text);
      }

      await bot.sendMessage(msg.chat.id, response);
      await userServices.awardPoints(msg.from.id, 1);
    } catch (error) {
      logger.error(`Message handling error: ${error.message}`);
      bot.sendMessage(msg.chat.id, '⚠️ Произошла ошибка при обработке сообщения.');
    }
  });

  // Обработчик ошибок бота
  bot.on('polling_error', (error) => {
    logger.error(`Polling error: ${error.message}`);
  });

  logger.info('Bot controllers initialized');
}