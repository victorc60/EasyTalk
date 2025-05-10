// botSetup.js
import schedule from 'node-schedule';
import { CONFIG } from './config.js';
import { sendUserMessage } from './utils/botUtils.js';
import { dailyFactBroadcast, wordGameBroadcast, startRolePlay } from './features/botFeatures.js';
import { cleanupInactiveUsers, awardPoints } from './services/userServices.js';
import { start, leaderboard, startRolePlayCommand, conversationTopic, setMode, showProgress } from './handlers/commandHandlers.js';
import User from './models/User.js';
import { OpenAI } from 'openai';

export async function setupBot(bot, userSessions, openai) {
  // Настройка планировщиков
  schedule.scheduleJob(CONFIG.DAILY_FACT_TIME, () => dailyFactBroadcast(bot));
  schedule.scheduleJob(CONFIG.WORD_GAME_TIME, () => wordGameBroadcast(bot, userSessions));
  schedule.scheduleJob(CONFIG.CLEANUP_TIME, cleanupInactiveUsers);

  // Настройка обработчиков команд
  bot.onText(/\/start/, (msg) => start(bot, msg));
  bot.onText(/\/leaders/, (msg) => leaderboard(bot, msg));
  bot.onText(/\/roleplay/, (msg) => startRolePlayCommand(bot, msg, userSessions));
  bot.onText(/\/topic/, (msg) => conversationTopic(bot, msg));
  bot.onText(/\/progress/, (msg) => showProgress(bot, msg));
  bot.onText(/\/mode$/, (msg) => setMode(bot, msg, userSessions)); // Обработчик для /mode
  bot.onText(/\/mode_(.+)/, (msg, match) => setMode(bot, msg, userSessions, match[1])); // Обработчик для /mode_<mode>

  // Обработчик сообщений
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text.trim();
    const userMode = userSessions.conversationModes.get(userId) || 'free_talk';

    try {
      await User.update(
        { last_activity: new Date() },
        { where: { telegram_id: userId } }
      );

      if (userSessions.wordGames.has(userId)) {
        const session = userSessions.wordGames.get(userId);
        const isCorrect = text.toLowerCase() === session.translation;
        
        clearTimeout(session.timer);
        userSessions.wordGames.delete(userId);

        if (isCorrect) {
          await awardPoints(userId, 15);
          await sendUserMessage(
            bot,
            chatId,
            `🎉 Поздравляем! Вы правильно перевели слово "${session.word}" как "${session.translation}"! +15 баллов!`
          );
        } else {
          await sendUserMessage(
            bot,
            chatId,
            `🤔 Неверный перевод. Правильный ответ: "${session.word}" → "${session.translation}". Не переживайте, в следующий раз получится!`
          );
        }
        return;
      }

      if (userSessions.activeDialogs.has(chatId)) {
        const dialog = userSessions.activeDialogs.get(chatId);
        dialog.messagesLeft--;
        dialog.dialogHistory.push({ role: "user", content: text });

        await bot.sendChatAction(chatId, 'typing');
        
        const { choices } = await openai.chat.completions.create({
          model: CONFIG.GPT_MODEL,
          messages: dialog.dialogHistory,
          temperature: 0.9,
          max_tokens: 150
        });

        const response = choices[0]?.message?.content;
        dialog.dialogHistory.push({ role: "assistant", content: response });

        if (dialog.messagesLeft <= 0) {
          userSessions.activeDialogs.delete(chatId);
          await awardPoints(userId, 30);
          await sendUserMessage(
            bot,
            chatId,
            `👋 ${dialog.character.farewell}\n\nДиалог завершен! +30 очков за практику!`
          );
        } else {
          await sendUserMessage(
            bot,
            chatId,
            `${response}\n\n(Осталось сообщений: ${dialog.messagesLeft})`
          );
        }
        return;
      }

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
          await startRolePlay(bot, chatId, userSessions);
          return;
      }

      const { choices } = await openai.chat.completions.create({
        model: CONFIG.GPT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        temperature: 0.7,
        max_tokens: 200
      });

      await sendUserMessage(bot, chatId, choices[0]?.message?.content);
      await awardPoints(userId, 1);

    } catch (error) {
      console.error('Ошибка обработки сообщения:', error.message);
      await sendUserMessage(bot, chatId, '⚠️ Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
  });

  // Установка команд бота
  await bot.setMyCommands([
    { command: 'start', description: 'Главное меню' },
    { command: 'roleplay', description: 'Ролевая игра с персонажем' },
    { command: 'topic', description: 'Тема для обсуждения' },
    { command: 'progress', description: 'Твой прогресс' },
    { command: 'leaders', description: 'Таблица лидеров' },
    { command: 'mode', description: 'Показать доступные режимы общения' },
    { command: 'mode_free_talk', description: 'Свободное общение на английском' },
    { command: 'mode_correction', description: 'Проверка и исправление ошибок' },
    { command: 'mode_role_play', description: 'Ролевые игры с персонажами' }
  ]);

  console.log('🤖 Бот запущен и готов к работе!');
}