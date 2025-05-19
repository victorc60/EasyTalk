// botSetup.js
import schedule from 'node-schedule';
import { CONFIG } from './config.js';
import { sendUserMessage, sendAdminMessage } from './utils/botUtils.js';
import { dailyFactBroadcast, wordGameBroadcast, startRolePlay, broadcastMessage } from './features/botFeatures.js';
import { cleanupInactiveUsers, awardPoints } from './services/userServices.js';
import { start, leaderboard, startRolePlayCommand, conversationTopic, setMode, showProgress, broadcast } from './handlers/commandHandlers.js';
import User from './models/User.js';
import { OpenAI } from 'openai';
import axios from 'axios'; // Для проверки URL картинки

// Константы для режимов бота
const BOT_MODES = {
  FREE_TALK: { id: 'free_talk', name: 'Свободное общение', description: 'Естественная практика английского с мягкими исправлениями' },
  CORRECTION: { id: 'correction', name: 'Исправление ошибок', description: 'Строгая проверка и объяснение ошибок' },
  ROLE_PLAY: { id: 'role_play', name: 'Ролевые игры', description: 'Диалоги с персонажами в разных ситуациях' }
};

export async function setupBot(bot, userSessions, openai) {
  setupSchedulers(bot, userSessions);
  await setupBotCommands(bot);
  setupCommandHandlers(bot, userSessions);
  setupCallbacks(bot, userSessions);
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
    CONFIG.WORD_GAME_TIMES.forEach((time, index) => {
      schedule.scheduleJob(`wordGame${index}`, time, () => {
        console.log(`Запуск wordGameBroadcast в ${time.hour}:${time.minute} ${time.tz}`);
        wordGameBroadcast(bot, userSessions);
      });
    });
    schedule.scheduleJob(CONFIG.CLEANUP_TIME, () => {
      console.log('Запуск cleanupInactiveUsers');
      cleanupInactiveUsers();
    });
  } catch (error) {
    console.error('Ошибка настройки планировщиков:', error);
    sendAdminMessage(bot, `‼️ Ошибка настройки планировщиков: ${error.message}`);
  }
}

async function setupBotCommands(bot) {
  try {
    await bot.deleteMyCommands({ scope: { type: 'default' }, language_code: 'ru' });
    console.log('✅ Все команды бота удалены');
    const commands = [
      { command: 'start', description: 'Главное меню' },
      { command: 'roleplay', description: 'Ролевая игра с персонажем' },
      { command: 'topic', description: 'Тема для обсуждения' },
      { command: 'progress', description: 'Твой прогресс' },
      { command: 'leaders', description: 'Таблица лидеров' },
      { command: 'mode', description: 'Выбор режима общения' },
      { command: 'mode_free_talk', description: 'Свободное общение на английском' },
      { command: 'mode_correction', description: 'Проверка и исправление ошибок' },
      { command: 'mode_role_play', description: 'Ролевые игры с персонажами' },
      { command: 'cancel_broadcast', description: 'Отменить рассылку (админ)' }
    ];
    await bot.setMyCommands(commands, { scope: { type: 'default' }, language_code: 'ru' });
    console.log('✅ Команды бота успешно установлены:', JSON.stringify(commands));
  } catch (error) {
    console.error('❌ Ошибка установки команд бота:', error);
    await sendAdminMessage(bot, `‼️ Ошибка установки команд бота: ${error.message}`);
    throw error;
  }
}

function setupCommandHandlers(bot, userSessions) {
  bot.onText(/\/start/, (msg) => start(bot, msg));
  bot.onText(/\/leaders/, (msg) => leaderboard(bot, msg));
  bot.onText(/\/roleplay/, (msg) => startRolePlayCommand(bot, msg, userSessions));
  bot.onText(/\/topic/, (msg) => conversationTopic(bot, msg));
  bot.onText(/\/progress/, (msg) => showProgress(bot, msg));
  bot.onText(/\/mode$/, (msg) => showModeSelection(bot, msg.chat.id));
  bot.onText(/\/mode_(.+)/, (msg, match) => setMode(bot, msg, userSessions, match[1]));
  bot.onText(/\/broadcast/, (msg) => broadcast(bot, msg, userSessions));
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

      if (data.startsWith('mode_')) {
        const selectedMode = data.split('_')[1];
        const validModes = Object.values(BOT_MODES).map(mode => mode.id);
        if (!validModes.includes(selectedMode)) {
          await sendUserMessage(bot, chatId, `⚠️ Неверный режим. Доступные: ${validModes.join(', ')}`, { parse_mode: 'HTML' });
        } else {
          userSessions.conversationModes.set(userId, selectedMode);
          await sendUserMessage(
            bot,
            chatId,
            `✅ Режим изменен на: <b>${getModeName(selectedMode)}</b>\n\n${getModeDescription(selectedMode)}`,
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

      await bot.answerCallbackQuery(callbackQuery.id);
    } catch (error) {
      console.error('Ошибка обработки callback:', error);
      await sendUserMessage(bot, chatId, '⚠️ Произошла ошибка при обработке действия.');
      await sendAdminMessage(bot, `‼️ Ошибка обработки callback: ${error.message}`);
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

        // Сохраняем картинку, если есть
        if (photo) {
          const photoId = photo[photo.length - 1].file_id;
          try {
            const file = await bot.getFile(photoId);
            const photoUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
            // Проверяем, является ли URL действительным изображением
            if (await isValidImageUrl(photoUrl)) {
              userSessions.broadcastContent.photo = photoUrl;
            } else {
              throw new Error('Некорректный формат изображения');
            }
          } catch (error) {
            console.error('Ошибка получения файла картинки:', error);
            userSessions.broadcastPending = false;
            userSessions.broadcastContent = { text: null, photo: null };
            await sendUserMessage(
              bot,
              chatId,
              '⚠️ Ошибка: некорректное изображение. Попробуйте другую картинку или отмените рассылку (/cancel_broadcast).',
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
        const userMode = userSessions.conversationModes.get(userId) || BOT_MODES.FREE_TALK.id;
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
  if (!userSessions.wordGames.has(userId)) {
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

  const session = userSessions.wordGames.get(userId);
  const isCorrect = text.toLowerCase() === session.translation.toLowerCase();

  clearTimeout(session.timer);
  userSessions.wordGames.delete(userId);

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
    case BOT_MODES.CORRECTION.id:
      systemPrompt = `You're an English corrector. Identify and correct any errors in the student's message. 
      Provide the corrected version first, then briefly explain the mistakes in Russian. 
      Keep explanations simple and clear.`;
      break;
    case BOT_MODES.ROLE_PLAY.id:
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

async function showModeSelection(bot, chatId) {
  try {
    await sendUserMessage(
      bot,
      chatId,
      '🔘 <b>Выберите режим общения:</b>\n\nКаждый режим предлагает разный подход к практике английского языка.\nИспользуйте /mode_free_talk, /mode_correction, /mode_role_play для быстрого выбора.',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: `${BOT_MODES.FREE_TALK.name} 🗣`, callback_data: `mode_${BOT_MODES.FREE_TALK.id}` }],
            [{ text: `${BOT_MODES.CORRECTION.name} ✏️`, callback_data: `mode_${BOT_MODES.CORRECTION.id}` }],
            [{ text: `${BOT_MODES.ROLE_PLAY.name} 🎭`, callback_data: `mode_${BOT_MODES.ROLE_PLAY.id}` }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('Ошибка показа выбора режима:', error);
    await sendUserMessage(bot, chatId, '⚠️ Произошла ошибка при выборе режима.');
    await sendAdminMessage(bot, `‼️ Ошибка показа выбора режима: ${error.message}`);
  }
}

function getModeName(modeId) {
  return Object.values(BOT_MODES).find(mode => mode.id === modeId)?.name || 'Неизвестный режим';
}

function getModeDescription(modeId) {
  return Object.values(BOT_MODES).find(mode => mode.id === modeId)?.description || '';
}