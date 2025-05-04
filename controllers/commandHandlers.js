const User = require('../models/User');
const { contentGenerators } = require('../services/contentGenerators');
const { sessionManager } = require('../middlewares/sessionMiddleware');
const { awardPoints, getLeaderboard } = require('../services/userServices');
const { startRolePlay, sendConversationStarter } = require('../services/gameServices');
const { client: metricsClient, messageCounter } = require('../utils/metrics');
const constants = require('../config/constants');
const logger = require('../utils/logger');

module.exports = {
  /**
   * Обработчик команды /start
   */
  async startCommand(bot, msg) {
    try {
      messageCounter.inc({ type: 'command_start' });
      
      const [user] = await User.findOrCreate({
        where: { telegram_id: msg.chat.id },
        defaults: {
          username: msg.from.username,
          first_name: msg.from.first_name,
          last_name: msg.from.last_name,
          points: 0,
          is_active: true,
          first_activity: new Date(),
          last_activity: new Date()
        }
      });

      const welcomeMessage = `
👋 <b>Привет, ${msg.from.first_name || 'друг'}!</b> Я твой помощник в изучении английского.

📌 <b>Доступные режимы:</b>
1. <b>Свободное общение</b> - просто пиши мне на английском
2. <b>Ролевые игры</b> (/roleplay) - общайся с разными персонажами
3. <b>Проверка ошибок</b> (/mode_correction) - я исправлю твои ошибки

🎮 <b>Активности:</b>
🔤 Слово дня в 18:30
📚 Интересные факты в 16:30
💬 /topic - тема для обсуждения

📊 /progress - твой прогресс
🏆 /leaders - таблица лидеров`;

      await bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: 'HTML' });
      logger.info(`New user started: ${msg.chat.id}`);
    } catch (error) {
      logger.error(`Start command error: ${error.message}`, { chatId: msg.chat.id });
      await bot.sendMessage(msg.chat.id, '⚠️ Произошла ошибка при запуске. Пожалуйста, попробуйте позже.');
    }
  },

  /**
   * Обработчик команды /leaders
   */
  async leaderboardCommand(bot, msg) {
    try {
      messageCounter.inc({ type: 'command_leaders' });
      
      const topUsers = await getLeaderboard(10);
      const user = await User.findOne({ where: { telegram_id: msg.from.id } });

      if (!topUsers.length) {
        await bot.sendMessage(msg.chat.id, '🏆 Таблица лидеров пока пуста. Будьте первым!');
        return;
      }

      const leaderboard = topUsers.map((user, i) => 
        `${i+1}. ${user.first_name || user.username || 'Аноним'}: ${user.points} очков`
      ).join('\n');

      await bot.sendMessage(
        msg.chat.id,
        `🏆 <b>Топ игроков:</b>\n\n${leaderboard}\n\nВаши очки: ${user?.points || 0}`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      logger.error(`Leaderboard command error: ${error.message}`, { chatId: msg.chat.id });
      await bot.sendMessage(msg.chat.id, '⚠️ Не удалось загрузить таблицу лидеров');
    }
  },

  /**
   * Обработчик команды /roleplay
   */
  async rolePlayCommand(bot, msg) {
    try {
      messageCounter.inc({ type: 'command_roleplay' });
      
      // Проверяем активный диалог
      if (sessionManager.activeDialogs.has(msg.chat.id)) {
        await bot.sendMessage(msg.chat.id, 'ℹ️ У вас уже есть активный диалог. Закончите его перед началом нового.');
        return;
      }

      await startRolePlay(bot, msg.chat.id);
      logger.info(`Roleplay started for user: ${msg.chat.id}`);
    } catch (error) {
      logger.error(`Roleplay command error: ${error.message}`, { chatId: msg.chat.id });
      await bot.sendMessage(msg.chat.id, '⚠️ Не удалось начать ролевую игру. Попробуйте позже.');
    }
  },

  /**
   * Обработчик команды /topic
   */
  async topicCommand(bot, msg) {
    try {
      messageCounter.inc({ type: 'command_topic' });
      
      await sendConversationStarter(bot, msg.chat.id);
      await awardPoints(msg.from.id, constants.POINTS.REGULAR_MESSAGE);
      logger.info(`Conversation topic sent to: ${msg.chat.id}`);
    } catch (error) {
      logger.error(`Topic command error: ${error.message}`, { chatId: msg.chat.id });
      await bot.sendMessage(msg.chat.id, '⚠️ Не удалось создать тему. Попробуйте позже.');
    }
  },

  /**
   * Обработчик команды /progress
   */
  async progressCommand(bot, msg) {
    try {
      messageCounter.inc({ type: 'command_progress' });
      
      const user = await User.findOne({ where: { telegram_id: msg.from.id } });
      if (!user) {
        await bot.sendMessage(msg.chat.id, 'ℹ️ Сначала запустите бота командой /start');
        return;
      }
      
      const progressMessage = `
📊 <b>Твой прогресс:</b>

🏅 Очков: ${user.points}
📅 Первый визит: ${user.first_activity.toLocaleDateString('ru-RU')}
🔄 Последняя активность: ${user.last_activity.toLocaleDateString('ru-RU')}

Продолжай практиковать английский!`;
      
      await bot.sendMessage(msg.chat.id, progressMessage, { parse_mode: 'HTML' });
    } catch (error) {
      logger.error(`Progress command error: ${error.message}`, { chatId: msg.chat.id });
      await bot.sendMessage(msg.chat.id, '⚠️ Произошла ошибка при получении прогресса');
    }
  },

  /**
   * Обработчик команды смены режима (/mode_*)
   */
  async modeCommand(bot, msg, mode) {
    try {
      messageCounter.inc({ type: 'command_mode' });
      
      const validModes = ['free_talk', 'role_play', 'correction'];
      if (!validModes.includes(mode)) {
        await bot.sendMessage(msg.chat.id, '⚠️ Неверный режим. Доступные: free_talk, role_play, correction');
        return;
      }
      
      sessionManager.conversationModes.set(msg.from.id, mode);
      await bot.sendMessage(msg.chat.id, `✅ Режим установлен: ${mode}`);
      logger.info(`User ${msg.chat.id} changed mode to: ${mode}`);
    } catch (error) {
      logger.error(`Mode command error: ${error.message}`, { chatId: msg.chat.id, mode });
      await bot.sendMessage(msg.chat.id, '⚠️ Не удалось изменить режим. Попробуйте позже.');
    }
  },

  /**
   * Обработчик команды /help
   */
  async helpCommand(bot, msg) {
    try {
      messageCounter.inc({ type: 'command_help' });
      
      const helpMessage = `
ℹ️ <b>Доступные команды:</b>

/start - Начало работы
/help - Эта справка
/roleplay - Ролевая игра
/topic - Тема для обсуждения
/progress - Ваш прогресс
/leaders - Таблица лидеров

<b>Режимы работы:</b>
/mode_free_talk - Свободное общение
/mode_correction - Режим исправления ошибок

📅 <b>Расписание:</b>
16:30 - Интересный факт дня
18:30 - Игра "Слово дня"`;
      
      await bot.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'HTML' });
    } catch (error) {
      logger.error(`Help command error: ${error.message}`, { chatId: msg.chat.id });
      await bot.sendMessage(msg.chat.id, '⚠️ Не удалось загрузить справку');
    }
  }
};