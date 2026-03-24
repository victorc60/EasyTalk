// features/botFeatures.js
import { CONFIG } from '../config.js';
import { sendAdminMessage, sendUserMessage } from '../utils/botUtils.js';
import { dailyFact, wordOfTheDay, idiomOfTheDay, phrasalVerbOfTheDay, randomCharacter, conversationTopic, dailyHoroscope, getPhrasalVerbUsageStats, quizOfTheDay, isWordPresentInBank } from '../content/contentGenerators.js';
import { sendToAllUsers, getLeaderboard, awardPoints } from '../services/userServices.js';
import { GAME_TYPES, recordWordGameParticipation, recordIdiomGameParticipation, recordPhrasalVerbGameParticipation, recordQuizGameParticipation, recordFactGameParticipation, saveDailyWordData, getSavedDailyWordData, saveDailyGameSession } from '../services/wordGameServices.js';
import { scheduleWordGameStatsNotification } from './wordGameNotifications.js';
import User from '../models/User.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { Op, fn, col } from 'sequelize';
import WordGameParticipation from '../models/WordGameParticipation.js';
import MiniEventParticipant from '../models/MiniEventParticipant.js';
import WeeklyLeaderboardReward from '../models/WeeklyLeaderboardReward.js';
import { getMoscowWeekRangeKeys } from '../utils/moscowWeek.js';

let phrasalVerbRepeatWarningSent = false;
const BONUS_BY_PLACE = [100, 75, 50];

async function getWeeklyLeaders(weekStartKey, weekEndKey) {
  const [gameRows, miniRewardedRows, miniQuizRows] = await Promise.all([
    WordGameParticipation.findAll({
      attributes: [
        'user_id',
        [fn('SUM', col('points_earned')), 'total_points']
      ],
      where: {
        game_date: {
          [Op.between]: [weekStartKey, weekEndKey]
        }
      },
      group: ['user_id'],
      raw: true
    }),
    MiniEventParticipant.findAll({
      attributes: [
        'user_id',
        [fn('SUM', col('reward_points')), 'total_points']
      ],
      where: {
        event_date: {
          [Op.between]: [weekStartKey, weekEndKey]
        },
        award_granted: true
      },
      group: ['user_id'],
      raw: true
    }),
    // Ивент ещё не финализован — очки только в quiz_points (иначе неделя «пустая» до 23:00)
    MiniEventParticipant.findAll({
      attributes: [
        'user_id',
        [fn('SUM', col('quiz_points')), 'total_points']
      ],
      where: {
        event_date: {
          [Op.between]: [weekStartKey, weekEndKey]
        },
        award_granted: false
      },
      group: ['user_id'],
      raw: true
    })
  ]);

  const pointsByUser = new Map();

  const addRows = (rows) => {
    for (const row of rows) {
      const userId = String(row.user_id);
      const total = Number(row.total_points) || 0;
      pointsByUser.set(userId, (pointsByUser.get(userId) || 0) + total);
    }
  };

  addRows(gameRows);
  addRows(miniRewardedRows);
  addRows(miniQuizRows);

  const userIds = Array.from(pointsByUser.keys());
  if (!userIds.length) {
    return [];
  }

  const users = await User.findAll({
    where: { telegram_id: { [Op.in]: userIds } },
    attributes: ['telegram_id', 'username', 'first_name', 'points'],
    raw: true
  });

  const usersById = new Map(users.map((u) => [String(u.telegram_id), u]));

  return userIds
    .map((id) => {
      const u = usersById.get(id) || {};
      return {
        userId: id,
        weeklyPoints: pointsByUser.get(id) || 0,
        totalPoints: Number(u.points) || 0,
        displayName: u.username || u.first_name || `Игрок ${id}`
      };
    })
    .filter((u) => u.weeklyPoints > 0)
    .sort((a, b) => {
      if (b.weeklyPoints !== a.weeklyPoints) return b.weeklyPoints - a.weeklyPoints;
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return a.displayName.localeCompare(b.displayName, 'ru');
    });
}

function buildWeeklyLeaderboardMessage(leaders, weekStartKey, weekEndKey, rewardedPlacesCount) {
  const rankIcons = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  const topFive = leaders.slice(0, 5);

  let text = `🏆 <b>Итоги недели EasyTalk</b>\n`;
  text += `📅 Период: ${weekStartKey} — ${weekEndKey}\n\n`;

  if (!topFive.length) {
    text += `Пока никто не набрал очков за эту неделю.\n`;
    text += `Начинаем новую неделю с нуля и врываемся в топ! 🚀`;
    return text;
  }

  text += `<b>Лидеры недели:</b>\n`;
  text += topFive
    .map((row, index) => `${rankIcons[index] || `${index + 1}.`} ${row.displayName} — <b>${row.weeklyPoints}</b> очков`)
    .join('\n');

  text += `\n\n🎉 Поздравляем победителей!`;
  if (rewardedPlacesCount > 0) {
    text += `\n🎁 Бонусы за неделю начислены: 1 место +100, 2 место +75, 3 место +50 очков.`;
  }

  text += `\n\n💪 Новая неделя = новый шанс подняться выше.`;
  text += `\nПродолжай практиковать английский каждый день, и ты точно окажешься в топе!`;

  return text;
}

export async function weeklyLeaderboardBroadcast(bot) {
  try {
    const { weekStartKey, weekEndKey, weekKey } = getMoscowWeekRangeKeys(new Date());
    const leaders = await getWeeklyLeaders(weekStartKey, weekEndKey);
    const topThree = leaders.slice(0, 3);
    const weekRecord = await WeeklyLeaderboardReward.findOne({
      where: { week_key: weekKey }
    });
    const alreadyRewarded = Boolean(weekRecord?.awarded);
    let rewardedPlacesCount = 0;

    if (!alreadyRewarded && topThree.length > 0) {
      const rewards = [];
      for (let i = 0; i < topThree.length; i += 1) {
        const bonus = BONUS_BY_PLACE[i];
        if (!bonus) continue;
        await awardPoints(topThree[i].userId, bonus);
        rewards.push({ user_id: topThree[i].userId, bonus_points: bonus, place: i + 1 });
        rewardedPlacesCount += 1;
      }
      if (weekRecord) {
        await weekRecord.update({
          awarded: true,
          awarded_at: new Date(),
          week_start: weekStartKey,
          week_end: weekEndKey,
          rewards
        });
      } else {
        await WeeklyLeaderboardReward.create({
          week_key: weekKey,
          awarded: true,
          awarded_at: new Date(),
          week_start: weekStartKey,
          week_end: weekEndKey,
          rewards
        });
      }
    }

    const message = buildWeeklyLeaderboardMessage(leaders, weekStartKey, weekEndKey, rewardedPlacesCount);
    const { success, fails } = await sendToAllUsers(
      bot,
      async () => message,
      (error, user) => {
        console.error(`Ошибка weekly leaderboard для пользователя ${user.telegram_id}:`, error.message);
        if (error.response?.statusCode === 403) {
          user.update({ isActive: false });
        }
      },
      { parse_mode: 'HTML' }
    );

    await sendAdminMessage(
      bot,
      `📊 Недельный лидерборд отправлен (${weekStartKey} — ${weekEndKey})\n✅ Успешно: ${success}\n❌ Ошибок: ${fails}\n🎁 Начислены бонусы местам 1-3: ${rewardedPlacesCount > 0 ? 'да' : 'нет (уже начислены или нет лидеров)'}`
    );
  } catch (error) {
    console.error('Ошибка в weeklyLeaderboardBroadcast:', error.message);
    await sendAdminMessage(bot, `‼️ Ошибка недельного лидерборда: ${error.message}`);
  }
}

function getMoscowDateString(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
}

async function finalizeExpiredFactSessions(userSessions) {
  if (!userSessions.factGames?.size) {
    return 0;
  }

  const todayKey = getMoscowDateString();
  let finalizedCount = 0;

  for (const [userId, session] of userSessions.factGames.entries()) {
    if (!session || session.dateKey === todayKey) {
      continue;
    }

    await recordFactGameParticipation(
      userId,
      session.claim,
      false,
      false,
      0,
      null,
      'default',
      session.dateKey
    );
    userSessions.factGames.delete(userId);
    finalizedCount += 1;
  }

  return finalizedCount;
}

export async function dailyFactBroadcast(bot, userSessions) {
  try {
    console.log('Запуск рассылки ежедневного факта...');

    const closedSessions = await finalizeExpiredFactSessions(userSessions);
    const fact = await dailyFact();
    if (!fact) {
      console.error('Не удалось получить ежедневный факт');
      await sendAdminMessage(bot, '⚠️ Не удалось получить ежедневный факт');
      return;
    }

    const sessionId = Math.random().toString(36).slice(2, 10);
    await saveDailyGameSession({
      gameType: GAME_TYPES.FACT,
      sessionId,
      prompt: fact.claim,
      translation: fact.isTrue ? 'True' : 'False',
      options: ['True', 'False'],
      correctIndex: fact.isTrue ? 0 : 1,
      meta: {
        claimRu: fact.claimRu,
        isTrue: fact.isTrue,
        explanation: fact.explanation
      }
    });

    const { success, fails } = await sendToAllUsers(
      bot,
      async (userId) => {
        await recordFactGameParticipation(
          userId,
          fact.claim,
          false,
          false,
          0,
          null
        );

        const dateKey = getMoscowDateString();

        userSessions.factGames.set(userId, {
          sessionId,
          factId: fact.id,
          claim: fact.claim,
          claimRu: fact.claimRu,
          isTrue: fact.isTrue,
          explanation: fact.explanation,
          startTime: Date.now(),
          dateKey,
          expired: false
        });

        return {
          text:
            `🌷✨ <b>Fact of the Day</b>\n\n` +
            `🇬🇧 ${fact.claim}\n` +
            `🇷🇺 ${fact.claimRu}\n\n` +
            `Веришь или не веришь?`,
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Верю', callback_data: `fact_game_${userId}_${sessionId}_true` }],
              [{ text: '🤔 Не верю', callback_data: `fact_game_${userId}_${sessionId}_false` }]
            ]
          }
        };
      },
      (error, user) => {
        console.error(`Ошибка для пользователя ${user.telegram_id}: ${error.message}`);
        if (error.response?.statusCode === 403) {
          user.update({ isActive: false });
        }
      }
    );

    console.log(`Рассылка завершена. Успешно: ${success}, Ошибок: ${fails}`);
    
    await sendAdminMessage(
      bot,
      `📊 Ежедневный факт отправлен\n✅ Успешно: ${success}\n❌ Ошибок: ${fails}\n🧹 Закрыто просроченных fact-сессий: ${closedSessions}${success === 0 && fails === 0 ? '\nℹ️ Нет зарегистрированных пользователей в базе данных' : ''}`
    );
  } catch (error) {
    console.error('Ошибка в dailyFactBroadcast:', error.message);
    await sendAdminMessage(bot, `‼️ Ошибка рассылки ежедневного факта: ${error.message}`);
  }
}

export async function wordGameBroadcast(bot, userSessions, slot = 'default') {
  try {
    let wordRecord = await getSavedDailyWordData(null, slot);
    if (wordRecord && !isWordPresentInBank(wordRecord.word)) {
      console.warn(`⚠️ Сохранённое слово дня отсутствует в текущем word_bank.json: ${wordRecord.word}`);
      wordRecord = null;
    }

    if (!wordRecord) {
      const generatedWord = await wordOfTheDay();
      if (!generatedWord) {
        console.warn('⚠️ Не удалось получить слово дня из word_bank.json');
        await sendAdminMessage(bot, '⚠️ Слово дня не отправлено: word_bank.json пуст или недоступен.');
        return;
      }
      const savedRecord = await saveDailyWordData(generatedWord, slot);
      if (!savedRecord) {
        console.warn('⚠️ Не удалось сохранить слово дня в базе');
        return;
      }
      wordRecord = savedRecord;
    } else {
      console.log(`🔁 Используем сохранённое слово дня (${slot}): ${wordRecord.word}`);
    }

    const broadcastWord = {
      id: wordRecord.id,
      word: wordRecord.word,
      translation: wordRecord.translation,
      options: Array.isArray(wordRecord.options) ? [...wordRecord.options] : [],
      example: wordRecord.example,
      fact: wordRecord.fact,
      mistakes: wordRecord.mistakes,
      correctIndex: typeof wordRecord.correctIndex === 'number'
        ? wordRecord.correctIndex
        : wordRecord.correct_index,
      slot
    };

    if (!broadcastWord.options.length) {
      console.error('❌ У слова дня отсутствуют варианты ответа');
      return;
    }

    const normalizedTranslation = broadcastWord.translation.toLowerCase();
    if (!Number.isInteger(broadcastWord.correctIndex) || broadcastWord.correctIndex < 0) {
      broadcastWord.correctIndex = broadcastWord.options.findIndex(
        option => option?.toLowerCase?.() === normalizedTranslation
      );
      if (broadcastWord.correctIndex === -1) {
        broadcastWord.correctIndex = Math.max(
          broadcastWord.options.indexOf(broadcastWord.translation),
          0
        );
      }
    }

    const { success, fails } = await sendToAllUsers(
      bot,
      async (userId) => {
        await recordWordGameParticipation(
          userId,
          broadcastWord.word,
          false,
          false,
          0,
          null,
          broadcastWord.slot || 'default'
        );

        const keyboard = {
          inline_keyboard: broadcastWord.options.map((option, index) => [{
            text: `${index + 1}. ${option}`,
            callback_data: `word_game_${userId}_${broadcastWord.id}_${index}`
          }])
        };

        const startTime = Date.now();
        const now = new Date();
        const moscowTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
        const endOfDay = new Date(moscowTime);
        endOfDay.setHours(23, 59, 59, 999);
        const timeUntilEndOfDay = endOfDay.getTime() - moscowTime.getTime();
        const timeoutDuration = CONFIG.WORD_GAME_TIMEOUT ?? timeUntilEndOfDay;
        const timeoutMessagePrefix = CONFIG.WORD_GAME_TIMEOUT ? '⏰ Время вышло!' : '🌙 День закончился!';

        let userGameMap = userSessions.wordGames.get(userId);
        if (!userGameMap) {
          userGameMap = new Map();
          userSessions.wordGames.set(userId, userGameMap);
        }

        const timer = setTimeout(async () => {
          const activeMap = userSessions.wordGames.get(userId);
          const session = activeMap?.get(broadcastWord.id.toString());
          if (!session) return;

          await recordWordGameParticipation(
            userId,
            session.word,
            false,
            false,
            0,
            null,
            session.slot || 'default'
          );

          await sendUserMessage(
            bot,
            userId,
            `${timeoutMessagePrefix} Правильный перевод:\n🌸📘 ${session.word} → ${session.translation}\n\n📝 Пример: ${session.example}\n💡 ${session.fact}\n⚠️ Частые ошибки: ${session.mistakes}\n\n<b>СОСТАВЬ ПРЕДЛОЖЕНИЕ С ЭТИМ СЛОВОМ И ЗАПОМНИ ЕГО НА ВСЕГДА</b>`,
            { parse_mode: 'HTML' }
          );

          activeMap.delete(broadcastWord.id.toString());
          if (activeMap.size === 0) {
            userSessions.wordGames.delete(userId);
          }
        }, timeoutDuration);

        userGameMap.set(broadcastWord.id.toString(), {
          ...broadcastWord,
          normalizedTranslation,
          startTime,
          timer
        });

        return {
          text: `🌸🎯 <b>Word of the Day</b>\n${broadcastWord.word}\n\n📝 Пример: ${broadcastWord.example}\n💡 ${broadcastWord.fact}\n\nВыберите правильный перевод:`,
          reply_markup: keyboard
        };
      },
      null,
      { parse_mode: 'HTML' }
    );

    console.log(`Слово дня (${slot}) отправлено. Успешно: ${success}, Ошибок: ${fails}`);
    await sendAdminMessage(
      bot,
      `📊 Слово дня (${slot}) отправлено\n✅ Успешно: ${success}\n❌ Ошибок: ${fails}`
    );
  } catch (error) {
    console.error('Ошибка в wordGameBroadcast:', error.message);
    await sendAdminMessage(bot, `‼️ Ошибка рассылки слова дня: ${error.message}`);
  }
}

export async function idiomGameBroadcast(bot, userSessions) {
  try {
    const idiomData = await idiomOfTheDay();
    if (!idiomData) {
      console.warn('⚠️ Не удалось получить идиому дня');
      await sendAdminMessage(bot, '⚠️ Не удалось сгенерировать идиому дня');
      return;
    }

    const sessionId = Math.random().toString(36).slice(2, 10);
    await saveDailyGameSession({
      gameType: GAME_TYPES.IDIOM,
      sessionId,
      prompt: idiomData.idiom,
      translation: idiomData.translation,
      options: idiomData.options,
      correctIndex: idiomData.correctIndex,
      meta: {
        meaning: idiomData.meaning,
        example: idiomData.example,
        hint: idiomData.hint
      }
    });

    const { success, fails } = await sendToAllUsers(
      bot,
      async (userId) => {
        await recordIdiomGameParticipation(
          userId,
          idiomData.idiom,
          false,
          false,
          0,
          null
        );

        const keyboard = {
          inline_keyboard: idiomData.options.map((option, index) => [{
            text: `${index + 1}. ${option}`,
            callback_data: `idiom_game_${userId}_${sessionId}_${index}`
          }])
        };

        userSessions.idiomGames.set(userId, {
          sessionId,
          idiom: idiomData.idiom,
          translation: idiomData.translation,
          meaning: idiomData.meaning,
          example: idiomData.example,
          hint: idiomData.hint,
          options: idiomData.options,
          correctIndex: idiomData.correctIndex,
          startTime: Date.now()
        });

        return {
          text: `🌷🧩 <b>Idiom of the Day</b>\n${idiomData.idiom}\n\n📝 Пример: ${idiomData.example || '—'}\n💡 Подсказка: ${idiomData.hint || 'Попробуй вспомнить контекст'}\n\nВыбери правильный перевод:`,
          reply_markup: keyboard
        };
      },
      (error, user) => {
        console.error(`Ошибка отправки идиомы пользователю ${user.telegram_id}:`, error.message);
        if (error.response?.statusCode === 403) {
          user.update({ isActive: false });
        }
      },
      { parse_mode: 'HTML' }
    );

    await sendAdminMessage(
      bot,
      `📊 Идиома дня отправлена\n✅ Успешно: ${success}\n❌ Ошибок: ${fails}${success === 0 && fails === 0 ? '\nℹ️ Нет зарегистрированных пользователей' : ''}`
    );
  } catch (error) {
    console.error('Ошибка в idiomGameBroadcast:', error.message);
    await sendAdminMessage(bot, `‼️ Ошибка рассылки идиомы: ${error.message}`);
  }
}

export async function phrasalVerbGameBroadcast(bot, userSessions) {
  try {
    const phrasalVerbData = await phrasalVerbOfTheDay();
    if (!phrasalVerbData) {
      console.warn('⚠️ Не удалось получить phrasal verb дня');
      await sendAdminMessage(bot, '⚠️ Не удалось сгенерировать phrasal verb дня');
      return;
    }

    const phrasalVerbUsage = getPhrasalVerbUsageStats();
    if (phrasalVerbUsage?.nextWillRepeat && !phrasalVerbRepeatWarningSent) {
      phrasalVerbRepeatWarningSent = true;
      await sendAdminMessage(
        bot,
        `⚠️ Банк phrasal verbs исчерпан: ${phrasalVerbUsage.used}/${phrasalVerbUsage.total}. Следующая рассылка пойдёт с повтором.\nДобавь новые записи в data/phrasal_verbs_bank.json, если хочешь продлить цикл без повторов.`
      );
    } else if (!phrasalVerbUsage?.nextWillRepeat) {
      phrasalVerbRepeatWarningSent = false;
    }

    const sessionId = Math.random().toString(36).slice(2, 10);
    await saveDailyGameSession({
      gameType: GAME_TYPES.PHRASAL_VERB,
      sessionId,
      prompt: phrasalVerbData.phrasalVerb,
      translation: phrasalVerbData.translation,
      options: phrasalVerbData.options,
      correctIndex: phrasalVerbData.correctIndex,
      meta: {
        meaning: phrasalVerbData.meaning,
        example: phrasalVerbData.example,
        hint: phrasalVerbData.hint
      }
    });

    const { success, fails } = await sendToAllUsers(
      bot,
      async (userId) => {
        await recordPhrasalVerbGameParticipation(
          userId,
          phrasalVerbData.phrasalVerb,
          false,
          false,
          0,
          null
        );

        const keyboard = {
          inline_keyboard: phrasalVerbData.options.map((option, index) => [{
            text: `${index + 1}. ${option}`,
            callback_data: `phrasal_verb_game_${userId}_${sessionId}_${index}`
          }])
        };

        if (!userSessions.phrasalVerbGames) {
          userSessions.phrasalVerbGames = new Map();
        }

        userSessions.phrasalVerbGames.set(userId, {
          sessionId,
          phrasalVerb: phrasalVerbData.phrasalVerb,
          translation: phrasalVerbData.translation,
          meaning: phrasalVerbData.meaning,
          example: phrasalVerbData.example,
          hint: phrasalVerbData.hint,
          options: phrasalVerbData.options,
          correctIndex: phrasalVerbData.correctIndex,
          startTime: Date.now()
        });

        return {
          text: `🌿🔤 <b>Phrasal Verb of the Day</b>\n${phrasalVerbData.phrasalVerb}\n\n📝 Пример: ${phrasalVerbData.example || '—'}\n💡 Подсказка: ${phrasalVerbData.hint || 'Попробуй вспомнить контекст'}\n\nВыбери правильный перевод:`,
          reply_markup: keyboard
        };
      },
      (error, user) => {
        console.error(`Ошибка отправки phrasal verb пользователю ${user.telegram_id}:`, error.message);
        if (error.response?.statusCode === 403) {
          user.update({ isActive: false });
        }
      },
      { parse_mode: 'HTML' }
    );

    await sendAdminMessage(
      bot,
      `📊 Phrasal Verb дня отправлен\n✅ Успешно: ${success}\n❌ Ошибок: ${fails}${success === 0 && fails === 0 ? '\nℹ️ Нет зарегистрированных пользователей' : ''}`
    );
  } catch (error) {
    console.error('Ошибка в phrasalVerbGameBroadcast:', error.message);
    await sendAdminMessage(bot, `‼️ Ошибка рассылки phrasal verb: ${error.message}`);
  }
}

export async function dailyHoroscopeBroadcast(bot) {
  try {
    console.log('Запуск рассылки ежедневного гороскопа...');
    const horoscope = await dailyHoroscope();
    if (!horoscope) {
      await sendAdminMessage(bot, '⚠️ Не удалось сгенерировать гороскоп');
      return;
    }
    const { success, fails } = await sendToAllUsers(
      bot,
      async () => horoscope,
      (error, user) => {
        console.error(`Ошибка для пользователя ${user.telegram_id}: ${error.message}`);
        if (error.response?.statusCode === 403) {
          user.update({ isActive: false });
        }
      },
      { parse_mode: 'HTML' }
    );
    await sendAdminMessage(bot, `📊 Гороскоп отправлен\n✅ Успешно: ${success}\n❌ Ошибок: ${fails}`);
  } catch (error) {
    console.error('Ошибка в dailyHoroscopeBroadcast:', error);
    await sendAdminMessage(bot, `‼️ Ошибка рассылки гороскопа: ${error.message}`);
  }
}

export async function quizGameBroadcast(bot, userSessions) {
  try {
    const quizData = await quizOfTheDay();
    if (!quizData) {
      await sendAdminMessage(bot, '⚠️ Не удалось получить вопрос квиза');
      return;
    }

    const sessionId = Math.random().toString(36).slice(2, 10);
    await saveDailyGameSession({
      gameType: GAME_TYPES.QUIZ,
      sessionId,
      prompt: quizData.question,
      options: quizData.options,
      correctIndex: quizData.correctIndex,
      meta: {
        hint: quizData.hint,
        explanation: quizData.explanation
      }
    });

    const { success, fails } = await sendToAllUsers(
      bot,
      async (userId) => {
        await recordQuizGameParticipation(
          userId,
          quizData.question,
          false,
          false,
          0,
          null
        );

        const keyboard = {
          inline_keyboard: quizData.options.map((option, index) => [{
            text: `${index + 1}. ${option}`,
            callback_data: `quiz_game_${userId}_${sessionId}_${index}`
          }])
        };

        if (!userSessions.quizGames) {
          userSessions.quizGames = new Map();
        }

        userSessions.quizGames.set(userId, {
          sessionId,
          question: quizData.question,
          options: quizData.options,
          correctIndex: quizData.correctIndex,
          hint: quizData.hint,
          explanation: quizData.explanation,
          startTime: Date.now()
        });

        return {
          text: `🌼🧠 <b>Quiz of the Day</b>\n${quizData.question}\n\n💡 Подсказка: ${quizData.hint || 'Подумай про контекст Международного женского дня'}\n\nВыбери правильный ответ:`,
          reply_markup: keyboard
        };
      },
      (error, user) => {
        console.error(`Ошибка отправки квиза пользователю ${user.telegram_id}:`, error.message);
        if (error.response?.statusCode === 403) {
          user.update({ isActive: false });
        }
      },
      { parse_mode: 'HTML' }
    );

    await sendAdminMessage(
      bot,
      `📊 Quiz дня отправлен\n✅ Успешно: ${success}\n❌ Ошибок: ${fails}${success === 0 && fails === 0 ? '\nℹ️ Нет зарегистрированных пользователей' : ''}`
    );
  } catch (error) {
    console.error('Ошибка в quizGameBroadcast:', error.message);
    await sendAdminMessage(bot, `‼️ Ошибка рассылки квиза: ${error.message}`);
  }
}

export async function startRolePlay(bot, chatId, userSessions, character = null) {
  if (!character) {
    character = await randomCharacter();
  }
  
  userSessions.activeDialogs.set(chatId, {
    character,
    messagesLeft: CONFIG.MAX_DIALOG_MESSAGES,
    dialogHistory: [
      { 
        role: "system", 
        content: `You are ${character.name}. ${character.description}. 
        Personality traits: ${character.traits?.join(', ') || 'none specified'}.
        Respond in character, keep answers under 2 sentences.`
      }
    ]
  });

  await sendUserMessage(
    bot,
    chatId,
    `🎭 <b>Role Play: ${character.name}</b>\n\n<i>${character.description}</i>\n\n${character.greeting}\n\nУ вас ${CONFIG.MAX_DIALOG_MESSAGES} сообщений для диалога.`,
    { parse_mode: 'HTML' }
  );
}
// Функция проверки, является ли URL действительным изображением
async function isValidImageUrl(url) {
  try {
    const response = await axios.head(url, { timeout: 5000 });
    const contentType = response.headers['content-type'];
    return contentType?.startsWith('image/') && ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'].includes(contentType);
  } catch (error) {
    console.error('Ошибка проверки URL картинки:', error.message);
    return false;
  }
}
// Функция проверки размера файла по URL
async function getFileSize(url) {
  try {
    const response = await axios.head(url, { timeout: 5000 });
    return parseInt(response.headers['content-length'] || 0);
  } catch (error) {
    console.error('Ошибка получения размера файла:', error.message);
    return 0;
  }
}

export async function broadcastMessage(bot, content) {
  try {
    const users = await User.findAll({ where: { is_active: true } });
    let successCount = 0;
    let errorCount = 0;

    // Проверяем валидность фото, если оно есть
    let isPhotoValid = true;
    if (content.photo) {
      // Проверяем, является ли content.photo File ID (Telegram File ID обычно начинается с AgAC или содержит много символов)
      const isFileId = /^[A-Za-z0-9_-]{20,}$/.test(content.photo);
      if (!isFileId) {
        // Проверяем, является ли URL валидным изображением
        isPhotoValid = await isValidImageUrl(content.photo);
        if (!isPhotoValid) {
          await sendAdminMessage(bot, `⚠️ Рассылка не выполнена: некорректный формат фото (${content.photo}). Поддерживаются JPEG, PNG, GIF, BMP, WEBP до 10 МБ.`);
          console.error(`Некорректный формат фото: ${content.photo}`);
          return;
        }
        // Проверяем размер файла
        const fileSize = await getFileSize(content.photo);
        if (fileSize > 10 * 1024 * 1024) { // 10 МБ
          await sendAdminMessage(bot, `⚠️ Рассылка не выполнена: размер фото (${fileSize / 1024 / 1024} МБ) превышает 10 МБ.`);
          console.error(`Слишком большой файл: ${fileSize} байт`);
          return;
        }
      }
    }

    for (const user of users) {
      try {
        if (content.photo && isPhotoValid) {
          await bot.sendPhoto(
            user.telegram_id,
            content.photo, // Может быть File ID или URL
            {
              caption: content.text || undefined,
              parse_mode: 'HTML'
            }
          );
        } else if (content.text) {
          await sendUserMessage(
            bot,
            user.telegram_id,
            content.text,
            { parse_mode: 'HTML' }
          );
        }
        successCount++;
      } catch (error) {
        console.error(`Ошибка отправки сообщения пользователю ${user.telegram_id}:`, error.message);
        errorCount++;
      }
      await new Promise(resolve => setTimeout(resolve, 100)); // Задержка 100 мс для избежания лимитов
    }

    const summary = `📢 Рассылка завершена:\n✅ Успешно отправлено: ${successCount} пользователям\n❌ Ошибок: ${errorCount}`;
    await sendAdminMessage(bot, summary);
    console.log(summary);
  } catch (error) {
    console.error('Ошибка при выполнении рассылки:', error);
    await sendAdminMessage(bot, `‼️ Ошибка рассылки: ${error.message}`);
  }
}

export async function sendConversationStarter(bot, chatId) {
  const topic = await conversationTopic();
  
  let message = `💬 <b>Тема для обсуждения:</b> ${topic.topic}\n\n`;
  message += `<b>Вопросы:</b>\n- ${topic.questions.join('\n- ')}\n\n`;
  message += `<b>Полезные слова:</b>\n${topic.vocabulary.map(v => `• ${v.word} - ${v.translation}`).join('\n')}`;
  
  await sendUserMessage(bot, chatId, message, { parse_mode: 'HTML' });
}


export async function showLeaderboard(bot, chatId, userId) {
  try {
    const topUsers = await getLeaderboard();
    const currentUser = await User.findOne({ where: { telegram_id: userId } });

    let leaderboardMessage = '🏆 <b>Топ игроков:</b>\n\n';
    
    if (topUsers.length === 0) {
      leaderboardMessage += 'ℹ️ Пока нет игроков с очками.\nНачните практиковать английский, чтобы попасть в топ!';
    } else {
      leaderboardMessage += topUsers
        .map((user, index) => {
          const displayName = user.username || user.first_name || `Игрок ${index + 1}`;
          return `${index + 1}. ${displayName}: ${user.points} очков`;
        })
        .join('\n');
    }

    if (currentUser) {
      leaderboardMessage += `\n\n📊 <b>Ваши очки:</b> ${currentUser.points}`;
    } else {
      leaderboardMessage += `\n\nℹ️ Вы еще не зарегистрированы. Напишите /start`;
    }

    await sendUserMessage(bot, chatId, leaderboardMessage, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Ошибка при отображении таблицы лидеров:', error);
    await sendUserMessage(bot, chatId, '⚠️ Произошла ошибка при загрузке таблицы лидеров. Попробуйте позже.', { parse_mode: 'HTML' });
    await sendAdminMessage(bot, `‼️ Ошибка в команде /top:\n${error.message}\nStack: ${error.stack}`);
  }
}
