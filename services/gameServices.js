import { sessionManager } from '../middlewares/sessionMiddleware.js';
import { contentGenerators } from './contentGenerators.js';
import UserService from './services/userServices.js';

import { CONFIG } from '../config/constants.js'
import logger from '../utils/logger.js';

export const gameServices = {
  /**
   * Запуск игры "Слово дня"
   */
  async startWordGame(bot, userId) {
    try {
      // Проверяем активную игру
      if (sessionManager.getWordGame(userId)) {
        await bot.sendMessage(userId, 'ℹ️ У вас уже есть активная игра!');
        return;
      }

      // Получаем слово дня
      const wordData = await contentGenerators.wordOfTheDay();
      
      // Устанавливаем таймер (5 минут)
      const timer = setTimeout(async () => {
        if (sessionManager.getWordGame(userId)) {
          sessionManager.deleteWordGame(userId);
          await bot.sendMessage(
            userId,
            `⏰ Время вышло! Правильный перевод:\n${wordData.word} → ${wordData.translation}\n\nПример: ${wordData.example}\n💡 ${wordData.fact}`
          );
        }
      }, CONFIG.WORD_GAME_TIMEOUT);

      // Сохраняем сессию игры
      sessionManager.setWordGame(userId, {
        word: wordData.word,
        translation: wordData.translation.toLowerCase(),
        timer
      });

      // Отправляем слово пользователю
      await bot.sendMessage(
        userId,
        `🎯 <b>Слово дня:</b> ${wordData.word}\n\n` +
        `📝 <b>Пример:</b> ${wordData.example}\n` +
        `💡 ${wordData.fact}\n\n` +
        `У вас 5 минут чтобы угадать перевод этого слова!`,
        { parse_mode: 'HTML' }
      );

      logger.info(`Word game started for user ${userId}`);
    } catch (error) {
      logger.error(`Word game start failed: ${error.message}`, { userId });
      await bot.sendMessage(userId, '⚠️ Не удалось начать игру. Попробуйте позже.');
    }
  },

  /**
   * Проверка ответа в игре "Слово дня"
   */
  async checkWordGameAnswer(bot, userId, userAnswer) {
    const gameSession = sessionManager.getWordGame(userId);
    if (!gameSession) return false;

    try {
      const isCorrect = userAnswer.toLowerCase() === gameSession.translation;
      clearTimeout(gameSession.timer);
      sessionManager.deleteWordGame(userId);

      if (isCorrect) {
        await userServices.awardPoints(userId, CONFIG.POINTS.WORD_GAME_CORRECT);
        await bot.sendMessage(
          userId,
          `🎉 <b>Правильно!</b> +${CONFIG.POINTS.WORD_GAME_CORRECT} очков!\n\n` +
          `Слово "${gameSession.word}" означает "${gameSession.translation}"`,
          { parse_mode: 'HTML' }
        );
      } else {
        await bot.sendMessage(
          userId,
          `🤔 Почти! Правильный перевод: ${gameSession.word} → ${gameSession.translation}`
        );
      }

      return true;
    } catch (error) {
      logger.error(`Word game check failed: ${error.message}`, { userId });
      return false;
    }
  },

  /**
   * Начало ролевой игры с персонажем
   */
  async startRolePlay(bot, chatId, character = null) {
    try {
      // Проверяем активный диалог
      if (sessionManager.getDialog(chatId)) {
        await bot.sendMessage(chatId, 'ℹ️ Закончите текущий диалог перед началом нового.');
        return;
      }

      // Получаем персонажа (если не передан)
      if (!character) {
        character = await contentGenerators.randomCharacter();
      }

      // Сохраняем сессию диалога
      sessionManager.setDialog(chatId, {
        character,
        messagesLeft: CONFIG.MAX_DIALOG_MESSAGES,
        dialogHistory: [
          { 
            role: "system", 
            content: `You are ${character.name}. ${character.description}. ` +
                     `Personality traits: ${character.traits.join(', ')}. ` +
                     `Respond in character, keep answers under 2 sentences.`
          }
        ]
      });

      // Приветственное сообщение персонажа
      await bot.sendMessage(
        chatId,
        `🎭 <b>Role Play: ${character.name}</b>\n\n` +
        `<i>${character.description}</i>\n\n` +
        `${character.greeting}\n\n` +
        `У вас ${CONFIG.MAX_DIALOG_MESSAGES} сообщений для диалога.`,
        { parse_mode: 'HTML' }
      );

      logger.info(`Roleplay started for chat ${chatId} with ${character.name}`);
    } catch (error) {
      logger.error(`Roleplay start failed: ${error.message}`, { chatId });
      await bot.sendMessage(chatId, '⚠️ Не удалось начать ролевую игру. Попробуйте позже.');
    }
  },

  /**
   * Обработка сообщения в ролевой игре
   */
  async handleRolePlayMessage(bot, chatId, userId, messageText) {
    const dialog = sessionManager.getDialog(chatId);
    if (!dialog) return false;

    try {
      // Обновляем историю диалога
      dialog.dialogHistory.push({ role: "user", content: messageText });
      dialog.messagesLeft--;

      // Получаем ответ от персонажа
      const response = await this.generateCharacterResponse(dialog.dialogHistory);
      dialog.dialogHistory.push({ role: "assistant", content: response });

      // Проверяем окончание диалога
      if (dialog.messagesLeft <= 0) {
        sessionManager.deleteDialog(chatId);
        await userServices.awardPoints(userId, CONFIG.POINTS.ROLE_PLAY_COMPLETE);
        await bot.sendMessage(
          chatId,
          `👋 ${dialog.character.farewell}\n\n` +
          `Диалог завершён! +${CONFIG.POINTS.ROLE_PLAY_COMPLETE} очков за практику!`,
          { parse_mode: 'HTML' }
        );
      } else {
        await bot.sendMessage(
          chatId,
          `${response}\n\n(Осталось сообщений: ${dialog.messagesLeft})`
        );
      }

      return true;
    } catch (error) {
      logger.error(`Roleplay message failed: ${error.message}`, { chatId });
      sessionManager.deleteDialog(chatId);
      await bot.sendMessage(chatId, '⚠️ Произошла ошибка в диалоге. Диалог завершён.');
      return false;
    }
  },

  /**
   * Генерация ответа персонажа через OpenAI
   */
  async generateCharacterResponse(history) {
    // В реальной реализации используйте вызов к API OpenAI
    // Здесь упрощённая заглушка для примера
    const lastMessage = history[history.length - 1].content;
    return `This is character response to: "${lastMessage}"`;
  },

  /**
   * Завершение ролевой игры досрочно
   */
  async endRolePlay(bot, chatId, userId) {
    const dialog = sessionManager.getDialog(chatId);
    if (!dialog) return;

    sessionManager.deleteDialog(chatId);
     await userServices.awardPoints(userId, Math.floor(CONFIG.POINTS.ROLE_PLAY_COMPLETE / 2));
    await bot.sendMessage(
      chatId,
      `🏁 Диалог с ${dialog.character.name} завершён досрочно. ` +
      `Вы получили ${Math.floor(CONFIG.POINTS.ROLE_PLAY_COMPLETE / 2)} очков.`
    );
  }
};