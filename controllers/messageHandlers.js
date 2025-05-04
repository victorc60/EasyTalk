const { contentGenerators } = require('../services/contentGenerators');
const { sessionManager } = require('../middlewares/sessionMiddleware');
const { awardPoints, getUser } = require('../services/userServices');
const { client: metricsClient, messageCounter } = require('../utils/metrics');
const constants = require('../config/constants');
const logger = require('../utils/logger');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

module.exports = {
  /**
   * Основной обработчик входящих сообщений
   */
  async handleMessage(bot, msg) {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text.trim();

    try {
      // Обновляем активность пользователя
      await User.update(
        { last_activity: new Date() },
        { where: { telegram_id: userId } }
      );

      // Увеличиваем счетчик метрик
      messageCounter.inc({ type: 'regular_message' });

      // Проверяем активную игру "Угадай слово"
      if (await this.handleWordGame(bot, chatId, userId, text)) {
        return;
      }

      // Проверяем активный диалог в ролевой игре
      if (await this.handleRolePlayDialog(bot, chatId, userId, text)) {
        return;
      }

      // Обрабатываем обычное сообщение в зависимости от режима
      await this.handleRegularMessage(bot, chatId, userId, text);
    } catch (error) {
      logger.error(`Message handling error: ${error.message}`, { 
        chatId, 
        userId, 
        text: text.substring(0, 50) 
      });
      await bot.sendMessage(chatId, "⚠️ Произошла ошибка. Пожалуйста, попробуйте позже.");
    }
  },

  /**
   * Обработчик игры "Угадай слово"
   */
  async handleWordGame(bot, chatId, userId, text) {
    if (!sessionManager.wordGames.has(userId)) return false;

    const session = sessionManager.wordGames.get(userId);
    const isCorrect = text.toLowerCase() === session.translation;

    // Очищаем сессию игры
    clearTimeout(session.timer);
    sessionManager.wordGames.delete(userId);

    if (isCorrect) {
      await awardPoints(userId, constants.POINTS.WORD_GAME_CORRECT);
      await bot.sendMessage(
        chatId, 
        `🎉 Правильно! +${constants.POINTS.WORD_GAME_CORRECT} очков!\n\n` +
        `Слово "${session.word}" означает "${session.translation}"`
      );
    } else {
      await bot.sendMessage(
        chatId, 
        `🤔 Почти! Правильный перевод: ${session.word} → ${session.translation}`
      );
    }

    return true;
  },

  /**
   * Обработчик диалога в ролевой игре
   */
  async handleRolePlayDialog(bot, chatId, userId, text) {
    if (!sessionManager.activeDialogs.has(chatId)) return false;

    const dialog = sessionManager.activeDialogs.get(chatId);
    dialog.messagesLeft--;
    dialog.dialogHistory.push({ role: "user", content: text });

    // Показываем индикатор набора сообщения
    await bot.sendChatAction(chatId, 'typing');

    // Генерируем ответ от персонажа
    const { choices } = await openai.chat.completions.create({
      model: constants.GPT_MODEL,
      messages: dialog.dialogHistory,
      temperature: 0.9,
      max_tokens: 150
    });

    const response = choices[0]?.message?.content;
    dialog.dialogHistory.push({ role: "assistant", content: response });

    // Проверяем завершение диалога
    if (dialog.messagesLeft <= 0) {
      sessionManager.activeDialogs.delete(chatId);
      await awardPoints(userId, constants.POINTS.ROLE_PLAY_COMPLETE);
      await bot.sendMessage(
        chatId,
        `👋 ${dialog.character.farewell}\n\n` +
        `Диалог завершен! +${constants.POINTS.ROLE_PLAY_COMPLETE} очков за практику!`
      );
    } else {
      await bot.sendMessage(
        chatId,
        `${response}\n\n(Осталось сообщений: ${dialog.messagesLeft})`
      );
    }

    return true;
  },

  /**
   * Обработчик обычных сообщений (не команд и не игр)
   */
  async handleRegularMessage(bot, chatId, userId, text) {
    const userMode = sessionManager.conversationModes.get(userId) || 'free_talk';

    // Показываем индикатор набора сообщения
    await bot.sendChatAction(chatId, 'typing');

    let systemPrompt = '';
    switch (userMode) {
      case 'free_talk':
        systemPrompt = `You're a friendly English teacher. Respond naturally to the student, keeping answers under 3 sentences. 
        If they make mistakes, provide the correct version subtly in your response. 
        Ask follow-up questions to continue the conversation.`;
        break;
      
      case 'correction':
        systemPrompt = `You're an English corrector. Identify and correct any errors in the student's message. 
        Provide the corrected version first, then briefly explain the mistakes in Russian. 
        Keep explanations simple and clear.`;
        break;
      
      case 'role_play':
        // Это не должно происходить, так как ролевые игры обрабатываются отдельно
        logger.warn(`Role play mode detected in regular message`, { userId });
        return;
    }

    // Генерируем ответ через OpenAI
    const { choices } = await openai.chat.completions.create({
      model: constants.GPT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      temperature: 0.7,
      max_tokens: 200
    });

    // Отправляем ответ и начисляем очки
    await bot.sendMessage(chatId, choices[0]?.message?.content);
    await awardPoints(userId, constants.POINTS.REGULAR_MESSAGE);
    
    logger.info(`Regular message processed`, { 
      userId, 
      mode: userMode, 
      length: text.length 
    });
  },

  /**
   * Обработчик callback-запросов от inline-кнопок
   */
  async handleCallbackQuery(bot, query) {
    try {
      const chatId = query.message.chat.id;
      const userId = query.from.id;
      const data = query.data;

      messageCounter.inc({ type: 'callback_query' });

      // Пример обработки callback'а для кнопки "Новая тема"
      if (data === 'new_topic') {
        await bot.answerCallbackQuery(query.id);
        await this.topicCommand(bot, { 
          chat: { id: chatId }, 
          from: { id: userId } 
        });
        return;
      }

      // Другие callback'ы можно добавить здесь
      await bot.answerCallbackQuery(query.id, { text: 'Действие выполнено' });
    } catch (error) {
      logger.error(`Callback handling error: ${error.message}`, { 
        query: JSON.stringify(query) 
      });
      await bot.answerCallbackQuery(query.id, { 
        text: '⚠️ Ошибка обработки запроса' 
      });
    }
  }
};