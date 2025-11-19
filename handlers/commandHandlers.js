// handlers/commandHandlers.js
import User from '../models/User.js';
import { sendUserMessage, sendAdminMessage } from '../utils/botUtils.js';
import { startRolePlay, showLeaderboard, sendConversationStarter, broadcastMessage } from '../features/botFeatures.js';
import { awardPoints } from '../services/userServices.js';
import { recordWordGameParticipation, getSavedDailyWordData } from '../services/wordGameServices.js';
import { notifyDailyWordGameStats } from '../features/wordGameNotifications.js';
import { notifySimpleWordGameStats, testAdminMessage } from '../features/simpleWordGameNotifications.js';
import { getPollStats, getLatestPoll } from '../services/pollServices.js';

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

Выбирай что тебе интересно и практикуй английский!`;

    await sendUserMessage(bot, msg.chat.id, welcomeMessage, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Ошибка при обработке команды /start:', error);
    await sendUserMessage(bot, msg.chat.id, '⚠️ Произошла ошибка при регистрации. Попробуйте еще раз.');
    await sendAdminMessage(bot, `‼️ Ошибка команды /start: ${error.message}`);
  }
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
    const user = await User.findOne({ where: { telegram_id: msg.from.id } });
    if (!user) {
      await sendUserMessage(bot, msg.chat.id, 'ℹ️ Сначала запустите бота командой /start');
      return;
    }
    
    const progressMessage = `
📊 <b>Твой прогресс:</b>

🏅 Очков: ${user.points}
📅 Первый визит: ${user.first_activity.toLocaleDateString()}
🔄 Последняя активность: ${user.last_activity.toLocaleDateString()}

Продолжай практиковать английский!`;
    
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
    
    // Clear the timer since user answered
    if (gameSession.timer) {
      clearTimeout(gameSession.timer);
    }
    
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
      responseTime
    );
    
    // Send result message
    let resultMessage = isCorrect 
      ? `✅ <b>Правильно!</b> +${points} очков\n\n`
      : `❌ <b>Неправильно!</b>\n\n`;
    
    resultMessage += `🎯 <b>${gameSession.word}</b> → <b>${correctAnswer}</b>\n\n`;
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
    if (parts.length !== 4 || parts[0] !== 'idiom' || parts[1] !== 'game') {
      return;
    }

    const targetUserId = parseInt(parts[2], 10);
    const selectedIndex = parseInt(parts[3], 10);

    if (targetUserId !== userId) return;

    const gameSession = userSessions.idiomGames.get(userId);
    if (!gameSession) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '⏰ Время игры истекло!',
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

    const selectedAnswer = gameSession.options[selectedIndex];
    const correctAnswer = gameSession.translation;

    let resultMessage = isCorrect
      ? `✅ <b>Верно!</b> +${points} очков\n\n`
      : `❌ <b>Неправильно.</b>\n\n`;

    resultMessage += `🗣 <b>${gameSession.idiom}</b>\n`;
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
    
    // Try simple version first (doesn't require database)
    if (userSessions) {
      await notifySimpleWordGameStats(bot, userSessions);
    } else {
      // Fallback to database version
      await notifyDailyWordGameStats(bot);
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
