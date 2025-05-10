// botSetup.js
import schedule from 'node-schedule';
import { CONFIG } from './config.js';
import { sendUserMessage } from './utils/botUtils.js';
import { dailyFactBroadcast, wordGameBroadcast, startRolePlay } from './features/botFeatures.js';
import { cleanupInactiveUsers, awardPoints } from './services/userServices.js';
import { start, leaderboard, startRolePlayCommand, conversationTopic, setMode, showProgress } from './handlers/commandHandlers.js';
import User from './models/User.js';
import { OpenAI } from 'openai';

// Константы для режимов бота
const BOT_MODES = {
  FREE_TALK: {
    id: 'free_talk',
    name: 'Свободное общение',
    description: 'Естественная практика английского с мягкими исправлениями'
  },
  CORRECTION: {
    id: 'correction',
    name: 'Исправление ошибок',
    description: 'Строгая проверка и объяснение ошибок'
  },
  ROLE_PLAY: {
    id: 'role_play',
    name: 'Ролевые игры',
    description: 'Диалоги с персонажами в разных ситуациях'
  }
};

export async function setupBot(bot, userSessions, openai) {
  // Настройка планировщиков
  setupSchedulers(bot, userSessions);

  // Установка команд бота
  await setupBotCommands(bot);

  // Настройка обработчиков команд
  setupCommandHandlers(bot, userSessions);

  // Обработчик callback-запросов (для inline клавиатур)
  setupCallbacks(bot, userSessions);

  // Главный обработчик сообщений
  setupMessageHandler(bot, userSessions, openai);

  console.log('🤖 Бот запущен и готов к работе!');
}

function setupSchedulers(bot, userSessions) {
  try {
    schedule.scheduleJob(CONFIG.DAILY_FACT_TIME, () => dailyFactBroadcast(bot));
    schedule.scheduleJob(CONFIG.WORD_GAME_TIME, () => wordGameBroadcast(bot, userSessions));
    schedule.scheduleJob(CONFIG.CLEANUP_TIME, cleanupInactiveUsers);
  } catch (error) {
    console.error('Ошибка настройки планировщиков:', error);
  }
}

async function setupBotCommands(bot) {
    try {
      // Явное удаление всех команд перед установкой новых
      await bot.deleteMyCommands();
      
      // Установка только нужных команд
      await bot.setMyCommands([], { scope: { type: 'default' } }); // все чаты по умолчанию
        await bot.setMyCommands([], { scope: { type: 'all_private_chats' } }); // приватные чаты
        await bot.setMyCommands([], { scope: { type: 'all_group_chats' } }); // групповые
        await bot.setMyCommands([], { scope: { type: 'all_chat_administrators' } }); 
      
      console.log('✅ Команды бота успешно обновлены');
    } catch (error) {
      console.error('❌ Ошибка обновления команд бота:', error);
      throw error; // Можно пробросить ошибку выше для обработки
    }
  }
  

function setupCommandHandlers(bot, userSessions) {
  bot.onText(/\/start/, (msg) => start(bot, msg));
  bot.onText(/\/leaders/, (msg) => leaderboard(bot, msg));
  
  bot.onText(/\/topic/, (msg) => conversationTopic(bot, msg));
  bot.onText(/\/progress/, (msg) => showProgress(bot, msg));
  bot.onText(/\/mode/, (msg) => showModeSelection(bot, msg.chat.id));
}

function setupCallbacks(bot, userSessions) {
  bot.on('callback_query', async (callbackQuery) => {
    try {
      const chatId = callbackQuery.message.chat.id;
      const userId = callbackQuery.from.id;
      const data = callbackQuery.data;

      // Обработка выбора режима
      if (data.startsWith('mode_')) {
        const selectedMode = data.split('_')[1];
        userSessions.conversationModes.set(userId, selectedMode);
        
        await bot.sendMessage(
          chatId,
          `✅ Режим изменен на: <b>${getModeName(selectedMode)}</b>\n\n${getModeDescription(selectedMode)}`,
          { parse_mode: 'HTML' }
        );
      }

      await bot.answerCallbackQuery(callbackQuery.id);
    } catch (error) {
      console.error('Ошибка обработки callback:', error);
    }
  });
}

function setupMessageHandler(bot, userSessions, openai) {
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text.trim();
    const userMode = userSessions.conversationModes.get(userId) || BOT_MODES.FREE_TALK.id;

    try {
      // Обновляем время последней активности
      await User.update(
        { last_activity: new Date() },
        { where: { telegram_id: userId } }
      );

      // Обработка игр со словами
      if (await handleWordGame(bot, chatId, userId, text, userSessions)) return;

      // Обработка активных диалогов
      if (await handleActiveDialogs(bot, chatId, userId, text, userSessions, openai)) return;

      // Основная обработка сообщений по режимам
      await handleRegularMessage(bot, chatId, userId, text, userMode, openai);

    } catch (error) {
      console.error('Ошибка обработки сообщения:', error);
      await sendUserMessage(bot, chatId, '⚠️ Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
  });
}

async function handleWordGame(bot, chatId, userId, text, userSessions) {
  if (!userSessions.wordGames.has(userId)) return false;

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
  
  return true;
}

async function handleActiveDialogs(bot, chatId, userId, text, userSessions, openai) {
  if (!userSessions.activeDialogs.has(chatId)) return false;

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
  
  return true;
}

async function handleRegularMessage(bot, chatId, userId, text, userMode, openai) {
  await bot.sendChatAction(chatId, 'typing');
  
  let systemPrompt = '';
  switch (userMode) {
    case BOT_MODES.CORRECTION.id:
      systemPrompt = `You're an English corrector. Identify and correct any errors in the student's message. 
      Provide the corrected version first, then briefly explain the mistakes in Russian. 
      Keep explanations simple and clear.`;
      break;
    case BOT_MODES.ROLE_PLAY.id:
      return; // Ролевые игры обрабатываются в handleActiveDialogs
    default: // FREE_TALK
      systemPrompt = `You're a friendly English teacher. Respond naturally to the student, keeping answers under 3 sentences. 
      If they make mistakes, provide the correct version subtly in your response. 
      Ask follow-up questions to continue the conversation.`;
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
}

async function showModeSelection(bot, chatId) {
  await bot.sendMessage(
    chatId,
    '🔘 <b>Выберите режим общения:</b>\n\nКаждый режим предлагает разный подход к практике английского языка.',
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{
            text: `${BOT_MODES.FREE_TALK.name} 🗣`,
            callback_data: `mode_${BOT_MODES.FREE_TALK.id}`
          }],
          [{
            text: `${BOT_MODES.CORRECTION.name} ✏️`,
            callback_data: `mode_${BOT_MODES.CORRECTION.id}`
          }],
          [{
            text: `${BOT_MODES.ROLE_PLAY.name} 🎭`,
            callback_data: `mode_${BOT_MODES.ROLE_PLAY.id}`
          }]
        ]
      }
    }
  );
}

function getModeName(modeId) {
  return Object.values(BOT_MODES).find(mode => mode.id === modeId)?.name || 'Неизвестный режим';
}

function getModeDescription(modeId) {
  return Object.values(BOT_MODES).find(mode => mode.id === modeId)?.description || '';
}