// botSetup.js
import schedule from 'node-schedule';
import { CONFIG } from './config.js';
import { sendUserMessage, sendAdminMessage } from './utils/botUtils.js';
import { dailyFactBroadcast, wordGameBroadcast, idiomGameBroadcast, phrasalVerbGameBroadcast, quizGameBroadcast, startRolePlay, broadcastMessage } from './features/botFeatures.js';
import { notifyDailyWordGameStats, handleEndOfDayWordGames } from './features/wordGameNotifications.js';
import { cleanupInactiveUsers, awardPoints } from './services/userServices.js';
import { start, leaderboard, startRolePlayCommand, conversationTopic, setMode, showProgress, broadcast, handleWordGameCallback, handleIdiomGameCallback, handlePhrasalVerbGameCallback, handleQuizGameCallback, showModeSelection, testHoroscope, addWordToHistory, wordGameStats, testAdmin, startPollCreation, showPollResults, gameBoss, periodStats, userStats, topUsers } from './handlers/commandHandlers.js';
import StoryHandlers from './handlers/storyHandlers.js';
import User from './models/User.js';
import { OpenAI } from 'openai';
import axios from 'axios'; // Для проверки URL картинки
import sharp from 'sharp';
import { createPoll, sendPollToAllUsers, savePollAnswer } from './services/pollServices.js';

// Bot modes are now defined in commandHandlers.js

export async function setupBot(bot, userSessions, openai) {
  // Initialize story handlers
  const storyHandlers = new StoryHandlers(openai);
  userSessions.storyHandlers = storyHandlers;
  
  setupSchedulers(bot, userSessions);
  await setupBotCommands(bot);
  setupCommandHandlers(bot, userSessions);
  setupCallbacks(bot, userSessions);
  setupPollAnswerHandler(bot);
  setupMessageHandler(bot, userSessions, openai);
  console.log('🤖 Бот запущен и готов к работе!');
}

function setupSchedulers(bot, userSessions) {
  try {
    console.log('Текущее время сервера:', new Date().toLocaleString('ru-RU', { timeZone: 'UTC' }));
    console.log('Текущее время Moscow:', new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }));
    schedule.scheduleJob(CONFIG.DAILY_FACT_TIME, () => {
      console.log('Запуск dailyFactBroadcast');
      dailyFactBroadcast(bot);
    });
    const buildRule = (time) => {
      const rule = new schedule.RecurrenceRule();
      rule.tz = time.tz || 'Europe/Moscow';
      rule.hour = time.hour;
      rule.minute = time.minute;
      rule.second = 0;
      return rule;
    };

    const logNextRun = (job, label) => {
      try {
        const next = job.nextInvocation();
        if (next) {
          console.log(`⏰ Следующий запуск ${label}: ${next.toString()}`);
        }
      } catch (e) {
        console.warn(`Не удалось получить следующий запуск для ${label}: ${e.message}`);
      }
    };

    CONFIG.WORD_GAME_TIMES.forEach((time, index) => {
      const slotId = time.slot || `slot_${index}_${time.hour ?? '0'}_${time.minute ?? '0'}`;
      const rule = buildRule(time);
      const job = schedule.scheduleJob(`wordGame${index}`, rule, async () => {
        console.log(`Запуск wordGameBroadcast (${slotId}) в ${time.hour}:${time.minute} ${rule.tz}`);
        await wordGameBroadcast(bot, userSessions, slotId);
      });

      if (!job) {
        console.error(`❌ Не удалось запланировать слово дня для слота ${slotId}`);
        sendAdminMessage(bot, `‼️ Не удалось запланировать слово дня для ${slotId}`);
      } else {
        logNextRun(job, `слова дня (${slotId})`);
      }
    });
    // Идиома дня в 13:00 по Москве
    schedule.scheduleJob(
      { hour: CONFIG.IDIOM_GAME_TIME.hour, minute: CONFIG.IDIOM_GAME_TIME.minute, tz: CONFIG.IDIOM_GAME_TIME.tz },
      () => {
        console.log('Запуск idiomGameBroadcast в 13:00 Europe/Moscow');
        idiomGameBroadcast(bot, userSessions);
      }
    );
    // Phrasal Verb дня в 20:00 по Москве
    schedule.scheduleJob(
      { hour: CONFIG.PHRASAL_VERB_GAME_TIME.hour, minute: CONFIG.PHRASAL_VERB_GAME_TIME.minute, tz: CONFIG.PHRASAL_VERB_GAME_TIME.tz },
      () => {
        console.log('Запуск phrasalVerbGameBroadcast в 20:00 Europe/Moscow');
        phrasalVerbGameBroadcast(bot, userSessions);
      }
    );
    // Quiz дня утром (замена гороскопа)
    schedule.scheduleJob(
      { hour: CONFIG.QUIZ_GAME_TIME.hour, minute: CONFIG.QUIZ_GAME_TIME.minute, tz: CONFIG.QUIZ_GAME_TIME.tz },
      () => {
        console.log('Запуск quizGameBroadcast утром');
        quizGameBroadcast(bot, userSessions);
      }
    );
    
    // Статистика ежедневной игры со словами в 00:05 по Москве
    schedule.scheduleJob(CONFIG.WORD_GAME_STATS_TIME, () => {
      console.log('Запуск обработки завершения дня и статистики в 00:05 Europe/Moscow');
      // First handle any remaining active games
      handleEndOfDayWordGames(bot, userSessions);
      // Then send statistics
      notifyDailyWordGameStats(bot);
    });
    
    schedule.scheduleJob(CONFIG.CLEANUP_TIME, () => {
      console.log('Запуск cleanupInactiveUsers');
      cleanupInactiveUsers();
      // Clean up old audio files and inactive story sessions
      if (userSessions.storyHandlers) {
        userSessions.storyHandlers.storyService.cleanupOldFiles();
        userSessions.storyHandlers.cleanupInactiveSessions();
      }
    });
  } catch (error) {
    console.error('Ошибка настройки планировщиков:', error);
    sendAdminMessage(bot, `‼️ Ошибка настройки планировщиков: ${error.message}`);
  }
}

async function setupBotCommands(bot) {
  try {
    // Telegram выбирает команды по наиболее специфичному scope и language_code.
    // Если раньше были установлены команды для all_private_chats / all_group_chats или для ru/en,
    // они могут "перебивать" default-список. Поэтому чистим и ставим команды сразу для всех.
    const scopes = [
      { type: 'default' },
      { type: 'all_private_chats' },
      { type: 'all_group_chats' }
    ];
    const languages = [undefined, 'ru', 'en'];

    for (const scope of scopes) {
      for (const language_code of languages) {
        const opts = language_code ? { scope, language_code } : { scope };
        await bot.deleteMyCommands(opts);
      }
    }
    console.log('✅ Команды бота очищены (scopes: default/private/group; languages: all/ru/en)');
    const commands = [
      { command: 'start', description: 'Главное меню' },
      { command: 'roleplay', description: 'Ролевая игра с персонажем' },
      { command: 'topic', description: 'Тема для обсуждения' },
      { command: 'story', description: 'Voice storytelling with audio' },
      { command: 'game_boss', description: 'Запуск Boss Grammar (WebApp)' },
      { command: 'boss', description: 'Запуск Boss Grammar (WebApp)' },
      { command: 'progress', description: 'Твой прогресс' },
      { command: 'leaders', description: 'Таблица лидеров' },
      { command: 'mode', description: 'Выбор режима общения' },
      { command: 'mode_free_talk', description: 'Свободное общение на английском' },
      { command: 'mode_correction', description: 'Проверка и исправление ошибок' },
      { command: 'mode_role_play', description: 'Ролевые игры с персонажами' },
      { command: 'cancel_broadcast', description: 'Отменить рассылку (админ)' },
      { command: 'poll', description: 'Создать опрос (админ)' },
      { command: 'poll_results', description: 'Результаты опроса (админ)' }
    ];
    for (const scope of scopes) {
      for (const language_code of languages) {
        const opts = language_code ? { scope, language_code } : { scope };
        await bot.setMyCommands(commands, opts);
      }
    }
    console.log('✅ Команды бота успешно установлены (scopes: default/private/group; languages: all/ru/en)');
  } catch (error) {
    console.error('❌ Ошибка установки команд бота:', error);
    await sendAdminMessage(bot, `‼️ Ошибка установки команд бота: ${error.message}`);
    throw error;
  }
}

function setupCommandHandlers(bot, userSessions) {
  bot.onText(/\/start/, (msg) => start(bot, msg));
  bot.onText(/\/game_boss/, (msg) => gameBoss(bot, msg));
  bot.onText(/\/boss/, (msg) => gameBoss(bot, msg));
  bot.onText(/\/leaders/, (msg) => leaderboard(bot, msg));
  bot.onText(/\/roleplay/, (msg) => startRolePlayCommand(bot, msg, userSessions));
  bot.onText(/\/topic/, (msg) => conversationTopic(bot, msg));
  bot.onText(/\/progress/, (msg) => showProgress(bot, msg));
  bot.onText(/\/mode$/, (msg) => showModeSelection(bot, msg.chat.id));
  bot.onText(/\/mode_(.+)/, (msg, match) => setMode(bot, msg, userSessions, match[1]));
  bot.onText(/\/broadcast/, (msg) => broadcast(bot, msg, userSessions));
  bot.onText(/\/test_horoscope/, (msg) => testHoroscope(bot, msg));
  bot.onText(/\/word_stats/, (msg) => wordGameStats(bot, msg, userSessions));
  bot.onText(/\/period_stats(?:\s+.+)?/, (msg) => periodStats(bot, msg));
  bot.onText(/\/user_stats(?:\s+.+)?/, (msg) => userStats(bot, msg));
  bot.onText(/\/top_users(?:\s+.+)?/, (msg) => topUsers(bot, msg));
  bot.onText(/\/test_admin/, (msg) => testAdmin(bot, msg));
  bot.onText(/\/add_word/, (msg) => addWordToHistory(bot, msg));
  bot.onText(/\/poll_results(?:\s+\d+)?/, (msg) => showPollResults(bot, msg));
  bot.onText(/\/poll$/, (msg) => startPollCreation(bot, msg, userSessions));
  bot.onText(/\/story/, (msg) => userSessions.storyHandlers.handleStoryCommand(bot, msg, userSessions));
  bot.onText(/\/cancel_broadcast/, async (msg) => {
    const userId = msg.from.id.toString();
    if (userId !== process.env.ADMIN_ID && userId !== "340048933") {
      await sendUserMessage(bot, msg.chat.id, '⚠️ Эта команда доступна только администратору.', { parse_mode: 'HTML' });
      return;
    }
    userSessions.broadcastPending = false;
    userSessions.broadcastContent = { text: null, photo: null };
    await sendUserMessage(bot, msg.chat.id, '❌ Рассылка отменена.', { parse_mode: 'HTML' });
  });
}

function setupCallbacks(bot, userSessions) {
  bot.on('callback_query', async (callbackQuery) => {
    try {
      const chatId = callbackQuery.message.chat.id;
      const userId = callbackQuery.from.id;
      const data = callbackQuery.data;

      // Handle word game callbacks
      if (data.startsWith('word_game_')) {
        await handleWordGameCallback(bot, callbackQuery, userSessions);
        return;
      }

      // Handle idiom game callbacks
      if (data.startsWith('idiom_game_')) {
        await handleIdiomGameCallback(bot, callbackQuery, userSessions);
        return;
      }

      // Handle phrasal verb game callbacks
      if (data.startsWith('phrasal_verb_game_')) {
        await handlePhrasalVerbGameCallback(bot, callbackQuery, userSessions);
        return;
      }

      // Handle quiz game callbacks
      if (data.startsWith('quiz_game_')) {
        await handleQuizGameCallback(bot, callbackQuery, userSessions);
        return;
      }

      // Handle story callbacks
      if (data.startsWith('story_')) {
        await userSessions.storyHandlers.handleStoryCallback(bot, callbackQuery, userSessions);
        return;
      }

      if (data.startsWith('mode_')) {
        // Extract full mode id after the prefix (handles values with underscores like "free_talk")
        const selectedMode = data.slice('mode_'.length);
        const validModes = ['free_talk', 'correction', 'role_play'];
        if (!validModes.includes(selectedMode)) {
          await sendUserMessage(bot, chatId, `⚠️ Неверный режим. Доступные: ${validModes.join(', ')}`, { parse_mode: 'HTML' });
        } else {
          userSessions.conversationModes.set(userId, selectedMode);
          const modeNames = {
            'free_talk': 'Свободное общение',
            'correction': 'Исправление ошибок', 
            'role_play': 'Ролевые игры'
          };
          const modeDescriptions = {
            'free_talk': 'Естественная практика английского с мягкими исправлениями',
            'correction': 'Строгая проверка и объяснение ошибок',
            'role_play': 'Диалоги с персонажами в разных ситуациях'
          };
          await sendUserMessage(
            bot,
            chatId,
            `✅ Режим изменен на: <b>${modeNames[selectedMode]}</b>\n\n${modeDescriptions[selectedMode]}`,
            { parse_mode: 'HTML' }
          );
        }
      }

      if (data === 'confirm_broadcast') {
        if (userId.toString() !== process.env.ADMIN_ID && userId.toString() !== "340048933") {
          await sendUserMessage(bot, chatId, '⚠️ Только админ может подтвердить рассылку.', { parse_mode: 'HTML' });
          return;
        }
        await broadcastMessage(bot, userSessions.broadcastContent);
        userSessions.broadcastPending = false;
        userSessions.broadcastContent = { text: null, photo: null };
        await sendUserMessage(bot, chatId, '📢 Рассылка начата!', { parse_mode: 'HTML' });
      }

      if (data === 'cancel_broadcast') {
        if (userId.toString() !== process.env.ADMIN_ID && userId.toString() !== "340048933") {
          await sendUserMessage(bot, chatId, '⚠️ Только админ может отменить рассылку.', { parse_mode: 'HTML' });
          return;
        }
        userSessions.broadcastPending = false;
        userSessions.broadcastContent = { text: null, photo: null };
        await sendUserMessage(bot, chatId, '❌ Рассылка отменена.', { parse_mode: 'HTML' });
      }

      if (data === 'confirm_poll') {
        const userIdStr = userId.toString();
        if (userIdStr !== process.env.ADMIN_ID && userIdStr !== "340048933") {
          await sendUserMessage(bot, chatId, '⚠️ Только админ может запускать опрос.', { parse_mode: 'HTML' });
          return;
        }

        const draft = userSessions.pollDrafts.get(userIdStr);
        if (!draft) {
          await sendUserMessage(bot, chatId, '⚠️ Черновик опроса не найден. Отправьте /poll заново.', { parse_mode: 'HTML' });
          return;
        }

        await bot.answerCallbackQuery(callbackQuery.id);

        const poll = await createPoll(draft.question, draft.options);
        const { success, fails } = await sendPollToAllUsers(bot, poll);

        userSessions.pollDrafts.delete(userIdStr);
        await sendUserMessage(
          bot,
          chatId,
          `🗳 Опрос запущен!\n✅ Успешно: ${success}\n❌ Ошибок: ${fails}`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      if (data === 'cancel_poll_creation') {
        const userIdStr = userId.toString();
        if (userIdStr !== process.env.ADMIN_ID && userIdStr !== "340048933") {
          await sendUserMessage(bot, chatId, '⚠️ Только админ может отменить опрос.', { parse_mode: 'HTML' });
          return;
        }
        userSessions.pollDrafts.delete(userIdStr);
        await sendUserMessage(bot, chatId, '❌ Черновик опроса очищен.', { parse_mode: 'HTML' });
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
      }

      await bot.answerCallbackQuery(callbackQuery.id);
    } catch (error) {
      console.error('Ошибка обработки callback:', error);
      await sendUserMessage(bot, chatId, '⚠️ Произошла ошибка при обработке действия.');
      await sendAdminMessage(bot, `‼️ Ошибка обработки callback: ${error.message}`);
    }
  });
}

function setupPollAnswerHandler(bot) {
  bot.on('poll_answer', async (pollAnswer) => {
    try {
      const result = await savePollAnswer(pollAnswer);
      if (!result?.handled) {
        console.log('Получен ответ на неизвестный опрос:', result?.reason);
      }
    } catch (error) {
      console.error('Ошибка обработки ответа опроса:', error);
      await sendAdminMessage(bot, `‼️ Ошибка обработки ответа опроса: ${error.message}`);
    }
  });
}

// Функция для проверки, является ли URL действительным изображением
async function isValidImageUrl(url) {
  try {
    const response = await axios.head(url, { timeout: 5000 });
    const contentType = response.headers['content-type'];
    return contentType?.startsWith('image/');
  } catch (error) {
    console.error('Ошибка проверки URL картинки:', error.message);
    return false;
  }
}

function setupMessageHandler(bot, userSessions, openai) {
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text?.trim();
    const photo = msg.photo;
    const caption = msg.caption?.trim();

    try {
      // Проверка, ожидает ли админ контент для рассылки
      if (userSessions.broadcastPending && (userId.toString() === process.env.ADMIN_ID || userId.toString() === "340048933")) {
        console.log('Получено сообщение для рассылки:', { text, caption, hasPhoto: !!photo });

        if (!text && !photo && !caption) {
          await sendUserMessage(
            bot,
            chatId,
            '⚠️ Пожалуйста, отправьте текст, картинку или оба.',
            { parse_mode: 'HTML' }
          );
          return;
        }

        // Сохраняем текст из text или caption
        if (text) {
          userSessions.broadcastContent.text = text;
        } else if (caption) {
          userSessions.broadcastContent.text = caption;
        }

        if (photo) {
          const photoId = photo[photo.length - 1].file_id;
          try {
            const file = await bot.getFile(photoId);
            const photoUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
            
            // Загружаем изображение и конвертируем в JPEG
            const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
            const convertedImage = await sharp(response.data)
              .jpeg({ quality: 80 })
              .toBuffer();
            
            // Отправляем конвертированное изображение в Telegram и получаем новый File ID
            const sentPhoto = await bot.sendPhoto(chatId, convertedImage, { caption: 'Конвертированное изображение' });
            userSessions.broadcastContent.photo = sentPhoto.photo[sentPhoto.photo.length - 1].file_id;
          } catch (error) {
            console.error('Ошибка конвертации изображения:', error);
            await sendUserMessage(
              bot,
              chatId,
              '⚠️ Ошибка: некорректное изображение. Попробуйте JPEG, PNG, GIF, BMP, WEBP до 10 МБ.',
              { parse_mode: 'HTML' }
            );
            return;
          }
        }

        // Показываем предпросмотр
        const previewMessage = userSessions.broadcastContent.text || '📷 Картинка без текста';
        console.log('Предпросмотр рассылки:', userSessions.broadcastContent);

        if (userSessions.broadcastContent.photo) {
          try {
            await bot.sendPhoto(
              chatId,
              userSessions.broadcastContent.photo,
              {
                caption: userSessions.broadcastContent.text || undefined,
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '✅ Подтвердить', callback_data: 'confirm_broadcast' },
                      { text: '❌ Отменить', callback_data: 'cancel_broadcast' }
                    ]
                  ]
                }
              }
            );
          } catch (error) {
            console.error('Ошибка отправки предпросмотра:', error);
            userSessions.broadcastPending = false;
            userSessions.broadcastContent = { text: null, photo: null };
            await sendUserMessage(
              bot,
              chatId,
              '⚠️ Ошибка предпросмотра изображения. Попробуйте другую картинку или отмените рассылку (/cancel_broadcast).',
              { parse_mode: 'HTML' }
            );
            return;
          }
        } else {
          await sendUserMessage(
            bot,
            chatId,
            `📢 Предпросмотр рассылки:\n\n${previewMessage}\n\nПодтвердить отправку?`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Подтвердить', callback_data: 'confirm_broadcast' },
                    { text: '❌ Отменить', callback_data: 'cancel_broadcast' }
                  ]
                ]
              }
            }
          );
        }
        return;
      }

      // Обработка черновика опроса от админа
      const userIdStr = userId.toString();
      if (text && userSessions.pollDrafts?.has(userIdStr) && (userIdStr === process.env.ADMIN_ID || userIdStr === "340048933")) {
        const parts = text.split('\n').map(line => line.trim()).filter(Boolean);

        if (parts.length < 3) {
          await sendUserMessage(
            bot,
            chatId,
            '⚠️ Нужно минимум 1 вопрос + 2 варианта. Отправьте заново.',
            { parse_mode: 'HTML' }
          );
          return;
        }

        const question = parts[0];
        const options = parts.slice(1);

        if (options.length > 10) {
          await sendUserMessage(
            bot,
            chatId,
            '⚠️ Слишком много вариантов. Максимум 10.',
            { parse_mode: 'HTML' }
          );
          return;
        }

        userSessions.pollDrafts.set(userIdStr, { question, options });

        const optionsList = options.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n');
        await sendUserMessage(
          bot,
          chatId,
          `🗳 <b>Предпросмотр опроса</b>\n${question}\n\n${optionsList}\n\nЗапустить рассылку?`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Запустить', callback_data: 'confirm_poll' },
                  { text: '❌ Отменить', callback_data: 'cancel_poll_creation' }
                ]
              ]
            }
          }
        );
        return;
      }

      // Пропускаем команды
      if (text && text.startsWith('/')) return;

      // Обновляем время последней активности
      await User.update(
        { last_activity: new Date() },
        { where: { telegram_id: userId } }
      );

      // Обработка игр со словами (только для текстовых сообщений)
      if (text && await handleWordGame(bot, chatId, userId, text, userSessions)) {
        return;
      }

      // Обработка активных диалогов
      if (text && await handleActiveDialogs(bot, chatId, userId, text, userSessions, openai)) {
        return;
      }

      // Основная обработка текстовых сообщений
      if (text) {
        const userMode = userSessions.conversationModes.get(userId) || 'free_talk';
        await handleRegularMessage(bot, chatId, userId, text, userMode, openai);
      } else {
        await sendUserMessage(
          bot,
          chatId,
          '⚠️ Пожалуйста, отправьте текстовое сообщение для ответа на слово дня или общения.',
          { parse_mode: 'HTML' }
        );
      }

    } catch (error) {
      console.error('Ошибка обработки сообщения:', error);
      userSessions.broadcastPending = false; // Сбрасываем состояние при любой ошибке
      userSessions.broadcastContent = { text: null, photo: null };
      await sendUserMessage(bot, chatId, '⚠️ Произошла ошибка. Пожалуйста, попробуйте позже или отмените рассылку (/cancel_broadcast).');
      await sendAdminMessage(bot, `‼️ Ошибка обработки сообщения: ${error.message}`);
    }
  });
}

// ... (остальные функции без изменений: handleWordGame, handleActiveDialogs, handleRegularMessage, showModeSelection, getModeName, getModeDescription)

async function handleWordGame(bot, chatId, userId, text, userSessions) {
  const userGameMap = userSessions.wordGames.get(userId);
  if (!userGameMap || userGameMap.size === 0) {
    return false;
  }

  if (!text) {
    console.log(`Получено нетекстовое сообщение от ${userId} для слова дня`);
    await sendUserMessage(
      bot,
      chatId,
      '⚠️ Пожалуйста, отправьте текстовое сообщение с переводом слова.',
      { parse_mode: 'HTML' }
    );
    return true;
  }

  const [gameId, session] = Array.from(userGameMap.entries()).pop();
  const isCorrect = text.toLowerCase() === session.translation.toLowerCase();

  if (session.timer) {
    clearTimeout(session.timer);
  }
  userGameMap.delete(gameId);
  if (userGameMap.size === 0) {
    userSessions.wordGames.delete(userId);
  }

  if (isCorrect) {
    await awardPoints(userId, 15);
    await sendUserMessage(
      bot,
      chatId,
      `🎉 Поздравляем! Вы правильно перевели слово "${session.word}" как "${session.translation}"! +15 баллов!`,
      { parse_mode: 'HTML' }
    );
  } else {
    await sendUserMessage(
      bot,
      chatId,
      `🤔 Неверный перевод. Правильный ответ: "${session.word}" → "${session.translation}". Не переживайте, в следующий раз получится!`,
      { parse_mode: 'HTML' }
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
      `👋 ${dialog.character.farewell}\n\nДиалог завершен! +30 очков за практику!`,
      { parse_mode: 'HTML' }
    );
  } else {
    await sendUserMessage(
      bot,
      chatId,
      `${response}\n\n(Осталось сообщений: ${dialog.messagesLeft})`,
      { parse_mode: 'HTML' }
    );
  }
  
  return true;
}

async function handleRegularMessage(bot, chatId, userId, text, userMode, openai) {
  await bot.sendChatAction(chatId, 'typing');
  
  let systemPrompt = '';
  switch (userMode) {
    case 'correction':
      systemPrompt = `You're an English corrector. Identify and correct any errors in the student's message. 
      Provide the corrected version first, then briefly explain the mistakes in Russian. 
      Keep explanations simple and clear.`;
      break;
    case 'role_play':
      await startRolePlay(bot, chatId, userSessions);
      return;
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

// These functions are now defined in commandHandlers.js
