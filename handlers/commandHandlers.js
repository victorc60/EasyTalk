// handlers/commandHandlers.js
import User from '../models/User.js';
import { sendUserMessage, sendAdminMessage } from '../utils/botUtils.js';
import { startRolePlay, showLeaderboard, sendConversationStarter, broadcastMessage } from '../features/botFeatures.js';
import { awardPoints } from '../services/userServices.js';
import { 
  GAME_TYPES,
  recordWordGameParticipation, 
  recordIdiomGameParticipation, 
  recordPhrasalVerbGameParticipation, 
  recordQuizGameParticipation,
  recordFactGameParticipation,
  getSavedDailyWordData, 
  getSavedDailyGameSession,
  hasUserAnsweredWordGame,
  getPeriodStats,
  getUserDetailedStats,
  getTopActiveUsers,
  comparePeriods,
  getPointsForUserToday,
  getPointsForUserThisWeek
} from '../services/wordGameServices.js';
import { notifyDailyWordGameStats, getTodayMoscowDateString } from '../features/wordGameNotifications.js';
import { notifySimpleWordGameStats, testAdminMessage } from '../features/simpleWordGameNotifications.js';
import { getPollStats, getLatestPoll } from '../services/pollServices.js';
import { sendMiniEventEntryPoint, adminTriggerMiniEventInvite, finalizeEventDay } from '../services/miniEventService.js';

export async function start(bot, msg) {
  try {
    const [user, created] = await User.findOrCreate({
      where: { telegram_id: msg.chat.id },
      defaults: {
        telegram_id: msg.chat.id,
        username: msg.from.username || `${msg.from.first_name}${msg.from.last_name ? ` ${msg.from.last_name}` : ''}`,
        first_name: msg.from.first_name,
        last_name: msg.from.last_name,
        first_activity: new Date(),
        last_activity: new Date(),
        points: 0,
        is_active: true
      }
    });

    if (created) {
      console.log(`Создан новый пользователь: ${msg.chat.id}`);
    } else {
      console.log(`Пользователь уже существует: ${msg.chat.id}, обновляем is_active`);
      await user.update({ is_active: true, last_activity: new Date() });
    }

    const welcomeMessage = `
👋 <b>Привет, ${msg.from.first_name}!</b> Я твой помощник в изучении английского.

📌 <b>Доступные режимы:</b>
1. <b>Свободное общение</b> - /mode_free_talk
2. <b>Ролевые игры</b> - /mode_role_play
3. <b>Проверка ошибок</b> - /mode_correction
📋 Показать режимы с выбором: /mode

🎮 <b>Игры и активность:</b>
🔤 Слово дня в 18:30
📚 Интересные факты в 17:30
💬 /topic - тема для обсуждения
🎭 /roleplay - ролевая игра
📚🎧 /story - voice storytelling with audio

📊 /progress - твой прогресс
🏆 /leaders - таблица лидеров

Выбирай что тебе интересно и практикуй английский!

🎮 <b>Boss Grammar</b> — запускай мини-игру через кнопку ниже (WebApp).`;

    const webAppUrl = process.env.BOSS_GRAMMAR_WEBAPP_URL;
    const replyMarkup = webAppUrl
      ? {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎮 Открыть Boss Grammar', web_app: { url: webAppUrl } }]
            ]
          }
        }
      : { parse_mode: 'HTML' };

    await sendUserMessage(bot, msg.chat.id, welcomeMessage, replyMarkup);
  } catch (error) {
    console.error('Ошибка при обработке команды /start:', error);
    await sendUserMessage(bot, msg.chat.id, '⚠️ Произошла ошибка при регистрации. Попробуйте еще раз.');
    await sendAdminMessage(bot, `‼️ Ошибка команды /start: ${error.message}`);
  }
}

export async function gameBoss(bot, msg) {
  const url = process.env.BOSS_GRAMMAR_WEBAPP_URL;
  if (!url) {
    await sendUserMessage(bot, msg.chat.id, '⚠️ Веб-версия Boss Grammar не настроена. Установите BOSS_GRAMMAR_WEBAPP_URL.');
    return;
  }

  const text = '🎮 Boss Grammar — нажми кнопку, чтобы открыть мини-игру в WebApp.';
  await sendUserMessage(bot, msg.chat.id, text, {
    reply_markup: {
      keyboard: [[{ text: '🎮 Boss Grammar', web_app: { url } }]],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  });
}

export async function leaderboard(bot, msg) {
  try {
    await showLeaderboard(bot, msg.chat.id, msg.from.id);
  } catch (error) {
    console.error('Ошибка в команде /leaders:', error);
    await sendUserMessage(
      bot,
      msg.chat.id,
      '⚠️ Не удалось загрузить таблицу лидеров. Попробуйте позже.',
      { parse_mode: 'HTML' }
    );
    await sendAdminMessage(
      bot,
      `‼️ Ошибка в команде /leaders: ${error.message}\nStack: ${error.stack}`
    );
  }
}

export async function startRolePlayCommand(bot, msg, userSessions) {
  try {
    await startRolePlay(bot, msg.chat.id, userSessions);
  } catch (error) {
    console.error('Ошибка в команде /roleplay:', error);
    await sendUserMessage(
      bot,
      msg.chat.id,
      '⚠️ Не удалось начать ролевую игру. Попробуйте позже.',
      { parse_mode: 'HTML' }
    );
    await sendAdminMessage(
      bot,
      `‼️ Ошибка в команде /roleplay: ${error.message}\nStack: ${error.stack}`
    );
  }
}

export async function conversationTopic(bot, msg) {
  try {
    await sendConversationStarter(bot, msg.chat.id);
  } catch (error) {
    console.error('Ошибка в команде /topic:', error);
    await sendUserMessage(
      bot,
      msg.chat.id,
      '⚠️ Не удалось загрузить тему. Попробуйте позже.',
      { parse_mode: 'HTML' }
    );
    await sendAdminMessage(
      bot,
      `‼️ Ошибка в команде /topic: ${error.message}\nStack: ${error.stack}`
    );
  }
}

// Bot modes configuration
const BOT_MODES = {
  FREE_TALK: { id: 'free_talk', name: 'Свободное общение', description: 'Естественная практика английского с мягкими исправлениями' },
  CORRECTION: { id: 'correction', name: 'Исправление ошибок', description: 'Строгая проверка и объяснение ошибок' },
  ROLE_PLAY: { id: 'role_play', name: 'Ролевые игры', description: 'Диалоги с персонажами в разных ситуациях' }
};

export async function setMode(bot, msg, userSessions, mode) {
  const validModes = ['free_talk', 'role_play', 'correction'];
  
  if (!mode) {
    await showModeSelection(bot, msg.chat.id);
    return;
  }

  if (!validModes.includes(mode)) {
    await sendUserMessage(
      bot,
      msg.chat.id,
      `⚠️ Неверный режим. Доступные: ${validModes.join(', ')}`,
      { parse_mode: 'HTML' }
    );
    return;
  }
  
  userSessions.conversationModes.set(msg.from.id, mode);
  await sendUserMessage(
    bot,
    msg.chat.id,
    `✅ Режим изменен на: <b>${getModeName(mode)}</b>\n\n${getModeDescription(mode)}`,
    { parse_mode: 'HTML' }
  );
}

export async function showModeSelection(bot, chatId) {
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

export async function showProgress(bot, msg) {
  try {
    const userId = msg.from.id;
    const user = await User.findOne({ where: { telegram_id: userId } });
    if (!user) {
      await sendUserMessage(bot, msg.chat.id, 'ℹ️ Сначала запустите бота командой /start');
      return;
    }

    const [pointsToday, pointsThisWeek] = await Promise.all([
      getPointsForUserToday(userId),
      getPointsForUserThisWeek(userId)
    ]);

    const progressMessage = `
📊 <b>Твой прогресс:</b>

🏅 Всего очков: ${user.points}
📈 За сегодня: ${pointsToday} очков
📆 За неделю: ${pointsThisWeek} очков

📅 Первый визит: ${user.first_activity.toLocaleDateString()}
🔄 Последняя активность: ${user.last_activity.toLocaleDateString()}

Продолжай практиковать английский — участвуй в играх и попадай в топ-5 за неделю!`;
    
    await sendUserMessage(bot, msg.chat.id, progressMessage, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Ошибка при отображении прогресса:', error);
    await sendUserMessage(bot, msg.chat.id, '⚠️ Произошла ошибка при загрузке прогресса.');
    await sendAdminMessage(
      bot,
      `‼️ Ошибка в команде /progress: ${error.message}\nStack: ${error.stack}`
    );
  }
}

export async function miniGame(bot, msg) {
  try {
    await sendMiniEventEntryPoint(bot, msg.chat.id, msg.from.id);
  } catch (error) {
    console.error('Ошибка в команде /mini_game:', error);
    await sendUserMessage(bot, msg.chat.id, '⚠️ Не удалось открыть мини-игру. Попробуйте позже.');
  }
}

export async function miniEventInviteAdmin(bot, msg) {
  try {
    const userId = msg.from.id.toString();
    if (userId !== process.env.ADMIN_ID && userId !== '340048933') {
      await sendUserMessage(bot, msg.chat.id, '⚠️ Эта команда доступна только администратору.');
      return;
    }

    const result = await adminTriggerMiniEventInvite(bot);
    await sendUserMessage(
      bot,
      msg.chat.id,
      `📣 Mini-event invite отправлен.\n✅ ${result.success || 0}\n❌ ${result.fails || 0}`
    );
  } catch (error) {
    console.error('Ошибка в команде /mini_event_invite:', error);
    await sendUserMessage(bot, msg.chat.id, '⚠️ Ошибка отправки invite mini-event.');
  }
}

export async function miniEventFinalizeAdmin(bot, msg) {
  try {
    const userId = msg.from.id.toString();
    if (userId !== process.env.ADMIN_ID && userId !== '340048933') {
      await sendUserMessage(bot, msg.chat.id, '⚠️ Эта команда доступна только администратору.');
      return;
    }

    const result = await finalizeEventDay(bot, null, true);
    if (result.ok) {
      await sendUserMessage(bot, msg.chat.id, `✅ Mini-event завершен. Участников: ${result.participants || 0}`);
      return;
    }
    await sendUserMessage(bot, msg.chat.id, `⚠️ Не удалось завершить mini-event: ${result.error}`);
  } catch (error) {
    console.error('Ошибка в команде /mini_event_finalize:', error);
    await sendUserMessage(bot, msg.chat.id, '⚠️ Ошибка завершения mini-event.');
  }
}

export async function broadcast(bot, msg, userSessions) {
  try {
    const userId = msg.from.id.toString();
    if (userId !== process.env.ADMIN_ID && userId !== "340048933") {
      await sendUserMessage(
        bot,
        msg.chat.id,
        '⚠️ Эта команда доступна только администратору.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    userSessions.broadcastPending = true;
    userSessions.broadcastContent = { text: null, photo: null };
    await sendUserMessage(
      bot,
      msg.chat.id,
      '📢 Отправьте текст, картинку или оба для рассылки всем пользователям.',
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    console.error('Ошибка при обработке команды /broadcast:', error);
    await sendUserMessage(
      bot,
      msg.chat.id,
      '⚠️ Произошла ошибка при подготовке рассылки.',
      { parse_mode: 'HTML' }
    );
    await sendAdminMessage(bot, `‼️ Ошибка команды /broadcast: ${error.message}`);
  }
}

export async function handleWordGameCallback(bot, callbackQuery, userSessions) {
  try {
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    
    // Parse callback data: word_game_${userId}_${gameId}_${index}
    const parts = data.split('_');
    if (parts.length !== 5 || parts[0] !== 'word' || parts[1] !== 'game') {
      return;
    }
    
    const targetUserId = parseInt(parts[2]);
    const gameId = parts[3];
    const selectedIndex = parseInt(parts[4]);
    
    // Check if this callback is for the current user
    if (targetUserId !== userId) {
      return;
    }
    if (!Number.isInteger(selectedIndex)) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '⚠️ Некорректный вариант ответа',
        show_alert: true
      });
      return;
    }
    // Check if user has an active word game
    const userGameMap = userSessions.wordGames.get(userId);
    let gameSession = userGameMap?.get(gameId);
    if (!gameSession) {
      const savedWord = await getSavedDailyWordData(null, 'default', gameId);
      if (savedWord) {
        const normalizedTranslation = savedWord.translation?.toLowerCase?.() || '';
        gameSession = {
          id: savedWord.id?.toString?.() || gameId,
          word: savedWord.word,
          translation: savedWord.translation,
          normalizedTranslation,
          options: savedWord.options || [],
          correctIndex: savedWord.correctIndex ?? savedWord.options?.findIndex(
            option => option?.toLowerCase?.() === normalizedTranslation
          ) ?? 0,
          example: savedWord.example,
          fact: savedWord.fact,
          mistakes: savedWord.mistakes,
          startTime: null,
          timer: null,
          slot: savedWord.slot || 'default'
        };
        if (!userGameMap) {
          userSessions.wordGames.set(userId, new Map([[gameSession.id, gameSession]]));
        } else {
          userGameMap.set(gameSession.id, gameSession);
        }
      }
    }
    
    if (!gameSession) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '⏰ Время игры истекло!',
        show_alert: true
      });
      return;
    }

    if (
      selectedIndex < 0 ||
      selectedIndex >= (gameSession.options?.length || 0)
    ) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '⚠️ Неверный вариант ответа',
        show_alert: true
      });
      return;
    }
    
    // Clear the timer since user answered
    if (gameSession.timer) {
      clearTimeout(gameSession.timer);
    }

    const slot = gameSession.slot || 'default';

    if (gameSession.answered) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: 'ℹ️ Ты уже ответил на это слово',
        show_alert: true
      });
      const activeMap = userSessions.wordGames.get(userId);
      activeMap?.delete(gameId);
      return;
    }

    const alreadyAnswered = await hasUserAnsweredWordGame(userId, slot);
    if (alreadyAnswered) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: 'ℹ️ Ты уже ответил на это слово сегодня',
        show_alert: true
      });
      const activeMap = userSessions.wordGames.get(userId);
      activeMap?.delete(gameId);
      return;
    }
    gameSession.answered = true;
    
    // Check if answer is correct
    const resolvedCorrectIndex = Math.max(
      0,
      Math.min(
        typeof gameSession.correctIndex === 'number' ? gameSession.correctIndex : 0,
        (gameSession.options?.length || 1) - 1
      )
    );
    const isCorrect = selectedIndex === resolvedCorrectIndex;
    const selectedAnswer = gameSession.options[selectedIndex];
    const correctAnswer = gameSession.translation;
    
    // Award points
    const points = isCorrect ? 10 : 0;
    if (isCorrect) {
      await awardPoints(userId, points);
    }
    
    // Record participation in database
    const responseTime = gameSession.startTime ? Date.now() - gameSession.startTime : null;
    await recordWordGameParticipation(
      userId, 
      gameSession.word, 
      true, // answered
      isCorrect, 
      points, 
      responseTime,
      gameSession.slot || 'default'
    );
    
    // Send result message
    let resultMessage = isCorrect 
      ? `✅ <b>Правильно!</b> +${points} очков\n\n`
      : `❌ <b>Неправильно!</b>\n\n`;
    
    resultMessage += `🌸🎯 <b>${gameSession.word}</b> → <b>${correctAnswer}</b>\n\n`;
    resultMessage += `📝 Пример: ${gameSession.example}\n`;
    resultMessage += `💡 ${gameSession.fact}\n`;
    resultMessage += `⚠️ Частые ошибки: ${gameSession.mistakes}\n\n`;
    resultMessage += `<b>СОСТАВЬ ПРЕДЛОЖЕНИЕ С ЭТИМ СЛОВОМ И ЗАПОМНИ ЕГО НА ВСЕГДА</b>`;
    
    await sendUserMessage(bot, userId, resultMessage, { parse_mode: 'HTML' });
    
    // Answer the callback query
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: isCorrect ? '✅ Правильно!' : '❌ Неправильно!',
      show_alert: false
    });
    
    // Remove game session
    const activeMap = userSessions.wordGames.get(userId);
    if (activeMap) {
      activeMap.delete(gameId);
      if (activeMap.size === 0) {
        userSessions.wordGames.delete(userId);
      }
    }
    
  } catch (error) {
    console.error('Ошибка при обработке callback word game:', error);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: '⚠️ Произошла ошибка',
      show_alert: true
    });
  }
}

export async function handleIdiomGameCallback(bot, callbackQuery, userSessions) {
  try {
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;

    const parts = data.split('_');
    if (parts.length !== 5 || parts[0] !== 'idiom' || parts[1] !== 'game') {
      return;
    }

    const targetUserId = parseInt(parts[2], 10);
    const sessionId = parts[3];
    const selectedIndex = parseInt(parts[4], 10);

    if (targetUserId !== userId) return;

    let gameSession = userSessions.idiomGames.get(userId);
    if ((!gameSession || gameSession.sessionId !== sessionId)) {
      const savedSession = await getSavedDailyGameSession(GAME_TYPES.IDIOM, sessionId);
      if (savedSession) {
        gameSession = {
          sessionId: savedSession.sessionId,
          idiom: savedSession.prompt,
          translation: savedSession.translation,
          meaning: savedSession.meta?.meaning || savedSession.translation,
          example: savedSession.meta?.example || '',
          hint: savedSession.meta?.hint || '',
          options: savedSession.options || [],
          correctIndex: savedSession.correctIndex,
          startTime: null
        };
        userSessions.idiomGames.set(userId, gameSession);
      }
    }

    if (!gameSession || gameSession.sessionId !== sessionId) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '⏰ Время игры истекло!',
        show_alert: true
      });
      return;
    }

    if (
      !Number.isInteger(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= (gameSession.options?.length || 0)
    ) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '⚠️ Неверный вариант',
        show_alert: true
      });
      return;
    }

    const resolvedCorrectIndex = Math.max(
      0,
      Math.min(
        typeof gameSession.correctIndex === 'number' ? gameSession.correctIndex : 0,
        (gameSession.options?.length || 1) - 1
      )
    );

    const isCorrect = selectedIndex === resolvedCorrectIndex;
    const points = isCorrect ? 8 : 0;
    if (isCorrect) {
      await awardPoints(userId, points);
    }

    const responseTime = gameSession.startTime ? Date.now() - gameSession.startTime : null;
    await recordIdiomGameParticipation(
      userId,
      gameSession.idiom,
      true,
      isCorrect,
      points,
      responseTime
    );

    const selectedAnswer = gameSession.options[selectedIndex];
    const correctAnswer = gameSession.translation;

    let resultMessage = isCorrect
      ? `✅ <b>Верно!</b> +${points} очков\n\n`
      : `❌ <b>Неправильно.</b>\n\n`;

    resultMessage += `🌷🧩 <b>${gameSession.idiom}</b>\n`;
    resultMessage += `🎯 Правильный перевод: <b>${correctAnswer}</b>\n`;
    resultMessage += `ℹ️ Значение: ${gameSession.meaning}\n`;
    if (gameSession.hint) {
      resultMessage += `💡 Подсказка: ${gameSession.hint}\n`;
    }
    if (gameSession.example) {
      resultMessage += `📝 Пример: ${gameSession.example}`;
    }

    await sendUserMessage(bot, userId, resultMessage, { parse_mode: 'HTML' });

    await bot.answerCallbackQuery(callbackQuery.id, {
      text: isCorrect ? '✅ Верно!' : `Правильный ответ: ${correctAnswer}`,
      show_alert: false
    });

    userSessions.idiomGames.delete(userId);
  } catch (error) {
    console.error('Ошибка при обработке callback idiom game:', error);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: '⚠️ Произошла ошибка',
      show_alert: true
    });
  }
}

export async function handleFactGameCallback(bot, callbackQuery, userSessions) {
  try {
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;

    const parts = data.split('_');
    if (parts.length !== 5 || parts[0] !== 'fact' || parts[1] !== 'game') {
      return;
    }

    const targetUserId = parseInt(parts[2], 10);
    const sessionId = parts[3];
    const selectedChoice = parts[4];

    if (targetUserId !== userId) return;

    if (!userSessions.factGames) {
      userSessions.factGames = new Map();
    }

    let gameSession = userSessions.factGames.get(userId);
    if ((!gameSession || gameSession.sessionId !== sessionId)) {
      const savedSession = await getSavedDailyGameSession(GAME_TYPES.FACT, sessionId);
      if (savedSession) {
        gameSession = {
          sessionId: savedSession.sessionId,
          factId: savedSession.id,
          claim: savedSession.prompt,
          claimRu: savedSession.meta?.claimRu || '',
          isTrue: Boolean(savedSession.meta?.isTrue),
          explanation: savedSession.meta?.explanation || '',
          startTime: null,
          dateKey: savedSession.gameDate,
          expired: false
        };
        userSessions.factGames.set(userId, gameSession);
      }
    }

    if (!gameSession || gameSession.sessionId !== sessionId || gameSession.expired) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '⏰ Время факта дня истекло!',
        show_alert: true
      });
      return;
    }

    if (!['true', 'false'].includes(selectedChoice)) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '⚠️ Неверный вариант',
        show_alert: true
      });
      return;
    }

    const selectedValue = selectedChoice === 'true';
    const isCorrect = selectedValue === gameSession.isTrue;
    const points = isCorrect ? 10 : 0;

    if (isCorrect) {
      await awardPoints(userId, points);
    }

    const responseTime = gameSession.startTime ? Date.now() - gameSession.startTime : null;
    await recordFactGameParticipation(
      userId,
      gameSession.claim,
      true,
      isCorrect,
      points,
      responseTime
    );

    const truthLabel = gameSession.isTrue ? 'True' : 'False';
    let resultMessage = isCorrect
      ? `✅ <b>Верно!</b> +${points} очков\n\n`
      : `❌ <b>Неверно.</b>\n\n`;

    resultMessage += `🌷✨ <b>Fact of the Day</b>\n`;
    resultMessage += `🇬🇧 ${gameSession.claim}\n`;
    resultMessage += `🇷🇺 ${gameSession.claimRu}\n\n`;
    resultMessage += `🎯 Правильный ответ: <b>${truthLabel}</b>\n\n`;
    resultMessage += `${gameSession.explanation}`;

    await sendUserMessage(bot, userId, resultMessage, { parse_mode: 'HTML' });
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: isCorrect ? '✅ Верно!' : `Правильный ответ: ${truthLabel}`,
      show_alert: false
    });

    userSessions.factGames.delete(userId);
  } catch (error) {
    console.error('Ошибка при обработке callback fact game:', error);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: '⚠️ Произошла ошибка',
      show_alert: true
    });
  }
}

export async function handlePhrasalVerbGameCallback(bot, callbackQuery, userSessions) {
  try {
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;

    const parts = data.split('_');
    if (parts.length !== 6 || parts[0] !== 'phrasal' || parts[1] !== 'verb' || parts[2] !== 'game') {
      return;
    }

    const targetUserId = parseInt(parts[3], 10);
    const sessionId = parts[4];
    const selectedIndex = parseInt(parts[5], 10);

    if (targetUserId !== userId) return;

    if (!userSessions.phrasalVerbGames) {
      userSessions.phrasalVerbGames = new Map();
    }

    let gameSession = userSessions.phrasalVerbGames.get(userId);
    if ((!gameSession || gameSession.sessionId !== sessionId)) {
      const savedSession = await getSavedDailyGameSession(GAME_TYPES.PHRASAL_VERB, sessionId);
      if (savedSession) {
        gameSession = {
          sessionId: savedSession.sessionId,
          phrasalVerb: savedSession.prompt,
          translation: savedSession.translation,
          meaning: savedSession.meta?.meaning || savedSession.translation,
          example: savedSession.meta?.example || '',
          hint: savedSession.meta?.hint || '',
          options: savedSession.options || [],
          correctIndex: savedSession.correctIndex,
          startTime: null
        };
        userSessions.phrasalVerbGames.set(userId, gameSession);
      }
    }

    if (!gameSession || gameSession.sessionId !== sessionId) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '⏰ Время игры истекло!',
        show_alert: true
      });
      return;
    }

    if (
      !Number.isInteger(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= (gameSession.options?.length || 0)
    ) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '⚠️ Неверный вариант',
        show_alert: true
      });
      return;
    }

    const resolvedCorrectIndex = Math.max(
      0,
      Math.min(
        typeof gameSession.correctIndex === 'number' ? gameSession.correctIndex : 0,
        (gameSession.options?.length || 1) - 1
      )
    );

    const isCorrect = selectedIndex === resolvedCorrectIndex;
    const points = isCorrect ? 8 : 0;
    if (isCorrect) {
      await awardPoints(userId, points);
    }

    const responseTime = gameSession.startTime ? Date.now() - gameSession.startTime : null;
    await recordPhrasalVerbGameParticipation(
      userId,
      gameSession.phrasalVerb,
      true,
      isCorrect,
      points,
      responseTime
    );

    const selectedAnswer = gameSession.options[selectedIndex];
    const correctAnswer = gameSession.translation;

    let resultMessage = isCorrect
      ? `✅ <b>Верно!</b> +${points} очков\n\n`
      : `❌ <b>Неправильно.</b>\n\n`;

    resultMessage += `🌿🔡 <b>${gameSession.phrasalVerb}</b>\n`;
    resultMessage += `🎯 Правильный перевод: <b>${correctAnswer}</b>\n`;
    resultMessage += `ℹ️ Значение: ${gameSession.meaning}\n`;
    if (gameSession.hint) {
      resultMessage += `💡 Подсказка: ${gameSession.hint}\n`;
    }
    if (gameSession.example) {
      resultMessage += `📝 Пример: ${gameSession.example}`;
    }

    await sendUserMessage(bot, userId, resultMessage, { parse_mode: 'HTML' });

    await bot.answerCallbackQuery(callbackQuery.id, {
      text: isCorrect ? '✅ Верно!' : `Правильный ответ: ${correctAnswer}`,
      show_alert: false
    });

    userSessions.phrasalVerbGames.delete(userId);
  } catch (error) {
    console.error('Ошибка при обработке callback phrasal verb game:', error);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: '⚠️ Произошла ошибка',
      show_alert: true
    });
  }
}

export async function handleQuizGameCallback(bot, callbackQuery, userSessions) {
  try {
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;

    const parts = data.split('_');
    if (parts.length !== 5 || parts[0] !== 'quiz' || parts[1] !== 'game') {
      return;
    }

    const targetUserId = parseInt(parts[2], 10);
    const sessionId = parts[3];
    const selectedIndex = parseInt(parts[4], 10);

    if (targetUserId !== userId) return;

    if (!userSessions.quizGames) {
      userSessions.quizGames = new Map();
    }

    let gameSession = userSessions.quizGames.get(userId);
    if ((!gameSession || gameSession.sessionId !== sessionId)) {
      const savedSession = await getSavedDailyGameSession(GAME_TYPES.QUIZ, sessionId);
      if (savedSession) {
        gameSession = {
          sessionId: savedSession.sessionId,
          question: savedSession.prompt,
          options: savedSession.options || [],
          correctIndex: savedSession.correctIndex,
          hint: savedSession.meta?.hint || '',
          explanation: savedSession.meta?.explanation || '',
          startTime: null
        };
        userSessions.quizGames.set(userId, gameSession);
      }
    }

    if (!gameSession || gameSession.sessionId !== sessionId) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '⏰ Время квиза истекло!',
        show_alert: true
      });
      return;
    }

    if (
      !Number.isInteger(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= (gameSession.options?.length || 0)
    ) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '⚠️ Неверный вариант',
        show_alert: true
      });
      return;
    }

    const resolvedCorrectIndex = Math.max(
      0,
      Math.min(
        typeof gameSession.correctIndex === 'number' ? gameSession.correctIndex : 0,
        (gameSession.options?.length || 1) - 1
      )
    );

    const isCorrect = selectedIndex === resolvedCorrectIndex;
    const points = isCorrect ? 5 : 0;
    if (isCorrect) {
      await awardPoints(userId, points);
    }

    const responseTime = gameSession.startTime ? Date.now() - gameSession.startTime : null;
    await recordQuizGameParticipation(
      userId,
      gameSession.question,
      true,
      isCorrect,
      points,
      responseTime
    );

    const correctAnswer = gameSession.options[resolvedCorrectIndex];

    let resultMessage = isCorrect
      ? `✅ <b>Верно!</b> +${points} очков\n\n`
      : `❌ <b>Неправильно.</b>\n\n`;

    resultMessage += `🌼🧠 <b>${gameSession.question}</b>\n`;
    resultMessage += `🎯 Правильный ответ: <b>${correctAnswer}</b>\n`;
    if (gameSession.hint) {
      resultMessage += `💡 Подсказка: ${gameSession.hint}\n`;
    }
    if (gameSession.explanation) {
      resultMessage += `ℹ️ ${gameSession.explanation}\n`;
    }

    await sendUserMessage(bot, userId, resultMessage, { parse_mode: 'HTML' });

    await bot.answerCallbackQuery(callbackQuery.id, {
      text: isCorrect ? '✅ Верно!' : `Правильный ответ: ${correctAnswer}`,
      show_alert: false
    });

    userSessions.quizGames.delete(userId);
  } catch (error) {
    console.error('Ошибка при обработке callback quiz game:', error);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: '⚠️ Произошла ошибка',
      show_alert: true
    });
  }
}

export async function wordGameStats(bot, msg, userSessions = null) {
  try {
    const userId = msg.from.id.toString();
    if (userId !== process.env.ADMIN_ID && userId !== "340048933") {
      await sendUserMessage(
        bot,
        msg.chat.id,
        '❌ У вас нет прав для выполнения этой команды.'
      );
      return;
    }

    console.log('Starting word game stats command...');
    await sendUserMessage(bot, msg.chat.id, '🔄 Получение статистики...');

    const parts = (msg.text || '').trim().split(/\s+/);
    let reportDate = getTodayMoscowDateString();
    if (parts[1] && /^\d{4}-\d{2}-\d{2}$/.test(parts[1])) {
      reportDate = parts[1];
    }

    try {
      await notifyDailyWordGameStats(bot, { reportDate, isScheduledRun: false });
    } catch (dbError) {
      console.error('Полная статистика недоступна, fallback:', dbError.message);
      if (userSessions) {
        await notifySimpleWordGameStats(bot, userSessions);
      } else {
        throw dbError;
      }
    }
  } catch (error) {
    console.error('Ошибка при получении статистики игры:', error);
    console.error('Full error:', error);
    await sendUserMessage(bot, msg.chat.id, `❌ Ошибка получения статистики: ${error.message}`);
  }
}

export async function testAdmin(bot, msg) {
  try {
    const userId = msg.from.id.toString();
    if (userId !== process.env.ADMIN_ID && userId !== "340048933") {
      await sendUserMessage(
        bot,
        msg.chat.id,
        '❌ У вас нет прав для выполнения этой команды.'
      );
      return;
    }
    
    console.log('Testing admin message functionality...');
    await sendUserMessage(bot, msg.chat.id, '🧪 Тестирование сообщений администратору...');
    
    await testAdminMessage(bot);
    await sendUserMessage(bot, msg.chat.id, '✅ Тестовое сообщение отправлено');
  } catch (error) {
    console.error('Ошибка при тестировании админ сообщений:', error);
    await sendUserMessage(bot, msg.chat.id, `❌ Ошибка тестирования: ${error.message}`);
  }
}

export async function testHoroscope(bot, msg) {
  try {
    const userId = msg.from.id.toString();
    if (userId !== process.env.ADMIN_ID && userId !== "340048933") {
      await sendUserMessage(
        bot,
        msg.chat.id,
        '⚠️ Эта команда доступна только администратору.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    await sendUserMessage(
      bot,
      msg.chat.id,
      '🔮 Генерирую тестовый гороскоп...',
      { parse_mode: 'HTML' }
    );

    const { dailyHoroscope } = await import('../content/contentGenerators.js');
    const horoscope = await dailyHoroscope();
    
    if (horoscope) {
      await sendUserMessage(
        bot,
        msg.chat.id,
        horoscope,
        { parse_mode: 'HTML' }
      );
      await sendUserMessage(
        bot,
        msg.chat.id,
        '✅ Тестовый гороскоп успешно сгенерирован!',
        { parse_mode: 'HTML' }
      );
    } else {
      await sendUserMessage(
        bot,
        msg.chat.id,
        '❌ Не удалось сгенерировать гороскоп',
        { parse_mode: 'HTML' }
      );
    }
  } catch (error) {
    console.error('Ошибка в тестовом гороскопе:', error);
    await sendUserMessage(
      bot,
      msg.chat.id,
      '⚠️ Произошла ошибка при генерации гороскопа.',
      { parse_mode: 'HTML' }
    );
    await sendAdminMessage(bot, `‼️ Ошибка в команде /test_horoscope: ${error.message}`);
  }
}

export async function addWordToHistory(bot, msg) {
  try {
    const userId = msg.from.id.toString();
    if (userId !== process.env.ADMIN_ID && userId !== "340048933") {
      await sendUserMessage(
        bot,
        msg.chat.id,
        '⚠️ Эта команда доступна только администратору.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const text = msg.text?.trim();
    const word = text?.replace('/add_word', '').trim();
    
    if (!word) {
      await sendUserMessage(
        bot,
        msg.chat.id,
        '📝 Использование: /add_word <слово>\n\nПример: /add_word whisper',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const { addWordToUsedHistory } = await import('../content/contentGenerators.js');
    addWordToUsedHistory(word);
    
    await sendUserMessage(
      bot,
      msg.chat.id,
      `✅ Слово "${word}" добавлено в историю использованных слов.\n\nТеперь оно не будет повторяться в играх со словами.`,
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    console.error('Ошибка при добавлении слова:', error);
    await sendUserMessage(
      bot,
      msg.chat.id,
      '⚠️ Произошла ошибка при добавлении слова.',
      { parse_mode: 'HTML' }
    );
    await sendAdminMessage(bot, `‼️ Ошибка в команде /add_word: ${error.message}`);
  }
}

export async function startPollCreation(bot, msg, userSessions) {
  try {
    const userId = msg.from.id.toString();
    if (userId !== process.env.ADMIN_ID && userId !== "340048933") {
      await sendUserMessage(
        bot,
        msg.chat.id,
        '⚠️ Эта команда доступна только администратору.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    userSessions.pollDrafts.set(userId, { status: 'awaiting_input' });
    await sendUserMessage(
      bot,
      msg.chat.id,
      '✏️ Отправьте текст опроса:\n1-я строка — вопрос\nСледующие строки — варианты ответа (минимум 2, максимум 10)\n\nПример:\nКак вам новый формат?\nОтлично\nНормально\nНе очень',
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    console.error('Ошибка запуска создания опроса:', error);
    await sendUserMessage(bot, msg.chat.id, '⚠️ Не удалось запустить создание опроса.');
    await sendAdminMessage(bot, `‼️ Ошибка команды /poll: ${error.message}`);
  }
}

export async function showPollResults(bot, msg) {
  try {
    const userId = msg.from.id.toString();
    if (userId !== process.env.ADMIN_ID && userId !== "340048933") {
      await sendUserMessage(
        bot,
        msg.chat.id,
        '⚠️ Эта команда доступна только администратору.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const args = msg.text?.split(' ') || [];
    const requestedId = args.length > 1 ? parseInt(args[1], 10) : null;
    const latestPoll = requestedId ? null : await getLatestPoll();
    const targetPollId = requestedId || latestPoll?.id;

    if (!targetPollId) {
      await sendUserMessage(
        bot,
        msg.chat.id,
        'ℹ️ Нет опросов для отображения.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const stats = await getPollStats(targetPollId);
    if (!stats) {
      await sendUserMessage(
        bot,
        msg.chat.id,
        `⚠️ Опрос с id ${targetPollId} не найден.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const { poll, deliveriesCount, responsesCount, optionCounts } = stats;
    const lines = poll.options.map((option, idx) => {
      const count = optionCounts[idx] || 0;
      const percent = deliveriesCount > 0 ? Math.round((count / deliveriesCount) * 100) : 0;
      return `${idx + 1}. ${option} — ${count} (${percent}%)`;
    });

    const notAnswered = Math.max(deliveriesCount - responsesCount, 0);
    const summary = [
      `<b>Опрос #${poll.id}</b>`,
      poll.question,
      '',
      lines.join('\n'),
      '',
      `Ответили: ${responsesCount} из ${deliveriesCount}`,
      notAnswered > 0 ? `Не ответили: ${notAnswered}` : ''
    ].filter(Boolean).join('\n');

    await sendUserMessage(
      bot,
      msg.chat.id,
      summary,
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    console.error('Ошибка показа результатов опроса:', error);
    await sendUserMessage(bot, msg.chat.id, '⚠️ Не удалось загрузить результаты опроса.');
    await sendAdminMessage(bot, `‼️ Ошибка команды /poll_results: ${error.message}`);
  }
}

/**
 * Получает статистику за период
 * Использование: /period_stats [days] или /period_stats [start_date] [end_date]
 * Примеры: /period_stats 7, /period_stats 2024-01-01 2024-01-31
 */
export async function periodStats(bot, msg) {
  try {
    const userId = msg.from.id.toString();
    if (userId !== process.env.ADMIN_ID && userId !== "340048933") {
      await sendUserMessage(
        bot,
        msg.chat.id,
        '❌ У вас нет прав для выполнения этой команды.'
      );
      return;
    }

    const text = msg.text?.trim() || '';
    const parts = text.split(/\s+/).filter(Boolean);
    
    let startDate, endDate;
    
    if (parts.length >= 3) {
      // Формат: /period_stats 2024-01-01 2024-01-31
      startDate = parts[1];
      endDate = parts[2];
    } else if (parts.length >= 2) {
      // Формат: /period_stats 7 (дней назад)
      const days = parseInt(parts[1], 10);
      if (isNaN(days) || days < 1) {
        await sendUserMessage(
          bot,
          msg.chat.id,
          '⚠️ Укажите количество дней (например: /period_stats 7) или даты (например: /period_stats 2024-01-01 2024-01-31)'
        );
        return;
      }
      const start = new Date();
      start.setDate(start.getDate() - days);
      startDate = start.toISOString().split('T')[0];
      endDate = new Date().toISOString().split('T')[0];
    } else {
      // По умолчанию - последние 7 дней
      const start = new Date();
      start.setDate(start.getDate() - 7);
      startDate = start.toISOString().split('T')[0];
      endDate = new Date().toISOString().split('T')[0];
    }

    await sendUserMessage(bot, msg.chat.id, '🔄 Получение статистики за период...');
    
    const stats = await getPeriodStats(startDate, endDate);
    
    if (!stats) {
      await sendUserMessage(bot, msg.chat.id, '⚠️ Не удалось получить статистику.');
      return;
    }

    let message = `📊 <b>Статистика за период</b>\n`;
    message += `📅 ${startDate} - ${endDate}\n\n`;
    
    message += `📈 <b>Общая статистика:</b>\n`;
    message += `• Всего игр: ${stats.summary.totalGames}\n`;
    message += `• Уникальных пользователей: ${stats.summary.uniqueUsers}\n`;
    message += `• Ответили: ${stats.summary.totalAnswered}\n`;
    message += `• Правильных ответов: ${stats.summary.totalCorrect}\n`;
    message += `• Всего очков: ${stats.summary.totalPoints}\n\n`;

    // Статистика по типам игр
    message += `🎮 <b>По типам игр:</b>\n`;
    const gameTypeNames = {
      'word': '🔤 Слово дня',
      'idiom': '🧩 Идиома дня',
      'phrasal_verb': '🔡 Phrasal Verb',
      'quiz': '❓ Квиз'
    };
    
    Object.keys(stats.byGameType).forEach(type => {
      const data = stats.byGameType[type];
      const name = gameTypeNames[type] || type;
      message += `\n${name}:\n`;
      message += `  • Всего: ${data.total}\n`;
      message += `  • Ответили: ${data.answered} (${data.participationRate}%)\n`;
      message += `  • Правильно: ${data.correct} (${data.accuracy}%)\n`;
      message += `  • Очки: ${data.totalPoints}\n`;
      if (data.avgResponseTime > 0) {
        message += `  • Среднее время ответа: ${Math.round(data.avgResponseTime / 1000)}с\n`;
      }
    });

    // Топ пользователей
    if (stats.byUser.length > 0) {
      message += `\n🏆 <b>Топ-10 активных пользователей:</b>\n`;
      stats.byUser.slice(0, 10).forEach((userData, index) => {
        const userName = userData.user?.username 
          ? `@${userData.user.username}` 
          : userData.user?.first_name || `ID:${userData.user?.telegram_id || 'unknown'}`;
        message += `${index + 1}. ${userName} - ${userData.totalPoints} очков (${userData.answered}/${userData.total})\n`;
      });
    }

    // Разбиваем на части, если сообщение слишком длинное
    const maxLength = 4000;
    if (message.length > maxLength) {
      const parts = [];
      let currentPart = '';
      const lines = message.split('\n');
      
      for (const line of lines) {
        if (currentPart.length + line.length + 1 > maxLength) {
          parts.push(currentPart);
          currentPart = line + '\n';
        } else {
          currentPart += line + '\n';
        }
      }
      if (currentPart) parts.push(currentPart);
      
      for (let i = 0; i < parts.length; i++) {
        await sendUserMessage(
          bot,
          msg.chat.id,
          parts[i] + (i < parts.length - 1 ? '\n<i>(продолжение...)</i>' : ''),
          { parse_mode: 'HTML' }
        );
      }
    } else {
      await sendUserMessage(bot, msg.chat.id, message, { parse_mode: 'HTML' });
    }
  } catch (error) {
    console.error('Ошибка получения статистики за период:', error);
    await sendUserMessage(bot, msg.chat.id, `❌ Ошибка: ${error.message}`);
  }
}

/**
 * Получает детальную статистику пользователя
 * Использование: /user_stats [user_id] [days]
 * Примеры: /user_stats 123456789, /user_stats 123456789 30
 */
export async function userStats(bot, msg) {
  try {
    const userId = msg.from.id.toString();
    if (userId !== process.env.ADMIN_ID && userId !== "340048933") {
      await sendUserMessage(
        bot,
        msg.chat.id,
        '❌ У вас нет прав для выполнения этой команды.'
      );
      return;
    }

    const text = msg.text?.trim() || '';
    const parts = text.split(/\s+/).filter(Boolean);
    
    if (parts.length < 2) {
      await sendUserMessage(
        bot,
        msg.chat.id,
        '⚠️ Использование: /user_stats [user_id] [days]\nПример: /user_stats 123456789 30'
      );
      return;
    }

    const targetUserId = parseInt(parts[1], 10);
    const days = parts.length >= 3 ? parseInt(parts[2], 10) : 30;
    
    if (isNaN(targetUserId)) {
      await sendUserMessage(bot, msg.chat.id, '⚠️ Неверный ID пользователя.');
      return;
    }

    if (isNaN(days) || days < 1) {
      await sendUserMessage(bot, msg.chat.id, '⚠️ Количество дней должно быть положительным числом.');
      return;
    }

    await sendUserMessage(bot, msg.chat.id, '🔄 Получение статистики пользователя...');
    
    const stats = await getUserDetailedStats(targetUserId, null, null, days);
    
    if (!stats || !stats.user) {
      await sendUserMessage(bot, msg.chat.id, '⚠️ Пользователь не найден или нет данных за указанный период.');
      return;
    }

    const userName = stats.user.username 
      ? `@${stats.user.username}` 
      : stats.user.first_name || `ID:${stats.user.telegram_id}`;

    let message = `👤 <b>Статистика пользователя</b>\n`;
    message += `Имя: ${userName}\n`;
    message += `ID: ${stats.user.telegram_id}\n`;
    message += `Период: последние ${days} дней (${stats.period.days} активных дней)\n\n`;
    
    message += `📊 <b>Общая статистика:</b>\n`;
    message += `• Всего игр: ${stats.summary.totalGames}\n`;
    message += `• Ответил: ${stats.summary.answeredGames} (${stats.summary.participationRate}%)\n`;
    message += `• Правильно: ${stats.summary.correctGames} (${stats.summary.accuracy}%)\n`;
    message += `• Пропустил: ${stats.summary.missedGames}\n`;
    message += `• Всего очков: ${stats.summary.totalPoints}\n`;
    if (stats.summary.avgResponseTime) {
      message += `• Среднее время ответа: ${Math.round(stats.summary.avgResponseTime / 1000)}с\n`;
    }
    message += `\n`;

    // По типам игр
    if (Object.keys(stats.byGameType).length > 0) {
      message += `🎮 <b>По типам игр:</b>\n`;
      const gameTypeNames = {
        'word': '🔤 Слово дня',
        'idiom': '🧩 Идиома дня',
        'phrasal_verb': '🔡 Phrasal Verb',
        'quiz': '❓ Квиз'
      };
      
      Object.keys(stats.byGameType).forEach(type => {
        const data = stats.byGameType[type];
        const name = gameTypeNames[type] || type;
        message += `\n${name}:\n`;
        message += `  • Игр: ${data.total}\n`;
        message += `  • Ответил: ${data.answered} (${data.participationRate}%)\n`;
        message += `  • Правильно: ${data.correct} (${data.accuracy}%)\n`;
        message += `  • Очки: ${data.totalPoints}\n`;
        if (data.avgResponseTime) {
          message += `  • Среднее время: ${Math.round(data.avgResponseTime / 1000)}с\n`;
        }
      });
    }

    await sendUserMessage(bot, msg.chat.id, message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Ошибка получения статистики пользователя:', error);
    await sendUserMessage(bot, msg.chat.id, `❌ Ошибка: ${error.message}`);
  }
}

/**
 * Получает топ самых активных пользователей
 * Использование: /top_users [limit] [days]
 * Примеры: /top_users, /top_users 20 30
 */
export async function topUsers(bot, msg) {
  try {
    const userId = msg.from.id.toString();
    if (userId !== process.env.ADMIN_ID && userId !== "340048933") {
      await sendUserMessage(
        bot,
        msg.chat.id,
        '❌ У вас нет прав для выполнения этой команды.'
      );
      return;
    }

    const text = msg.text?.trim() || '';
    const parts = text.split(/\s+/).filter(Boolean);
    
    const limit = parts.length >= 2 ? parseInt(parts[1], 10) : 10;
    const days = parts.length >= 3 ? parseInt(parts[2], 10) : 30;
    
    if (isNaN(limit) || limit < 1 || limit > 50) {
      await sendUserMessage(bot, msg.chat.id, '⚠️ Лимит должен быть от 1 до 50.');
      return;
    }

    if (isNaN(days) || days < 1) {
      await sendUserMessage(bot, msg.chat.id, '⚠️ Количество дней должно быть положительным числом.');
      return;
    }

    await sendUserMessage(bot, msg.chat.id, '🔄 Получение топа пользователей...');
    
    const topUsers = await getTopActiveUsers(limit, days);
    
    if (!topUsers || topUsers.length === 0) {
      await sendUserMessage(bot, msg.chat.id, '⚠️ Нет данных за указанный период.');
      return;
    }

    let message = `🏆 <b>Топ-${topUsers.length} активных пользователей</b>\n`;
    message += `Период: последние ${days} дней\n\n`;

    topUsers.forEach((userData, index) => {
      const userName = userData.user?.username 
        ? `@${userData.user.username}` 
        : userData.user?.first_name || `ID:${userData.user?.telegram_id || 'unknown'}`;
      
      message += `${index + 1}. ${userName}\n`;
      message += `   • Очки: ${userData.totalPoints}\n`;
      message += `   • Игр: ${userData.totalGames} (ответил: ${userData.answeredGames})\n`;
      message += `   • Точность: ${userData.accuracy}%\n`;
      message += `   • Активных дней: ${userData.activeDays}\n`;
      message += `\n`;
    });

    await sendUserMessage(bot, msg.chat.id, message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Ошибка получения топа пользователей:', error);
    await sendUserMessage(bot, msg.chat.id, `❌ Ошибка: ${error.message}`);
  }
}
