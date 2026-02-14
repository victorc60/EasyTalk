// services/wordGameServices.js
import WordGameParticipation from '../models/WordGameParticipation.js';
import DailyWordGame from '../models/DailyWordGame.js';
import User from '../models/User.js';
import { Op } from 'sequelize';

export const GAME_TYPES = {
  WORD: 'word',
  IDIOM: 'idiom',
  PHRASAL_VERB: 'phrasal_verb',
  QUIZ: 'quiz'
};

const resolveDate = (date = null) => date || new Date().toISOString().split('T')[0];

/**
 * Универсальная запись участия пользователя в играх
 * @param {Object} params
 * @param {number} params.userId - ID пользователя в Telegram
 * @param {string} params.word - Основное слово/идиома
 * @param {boolean} params.answered - Ответил ли пользователь
 * @param {boolean} params.correct - Правильный ли ответ
 * @param {number} params.pointsEarned - Заработанные очки
 * @param {number} params.responseTime - Время ответа в миллисекундах
 * @param {string} params.gameType - Тип игры (word, idiom)
 * @param {string} params.slot - Слот игры (для нескольких рассылок в день)
 */
export async function recordGameParticipation({
  userId,
  word,
  answered,
  correct,
  pointsEarned = 0,
  responseTime = null,
  gameType = GAME_TYPES.WORD,
  slot = 'default'
}) {
  try {
    const today = resolveDate();
    await WordGameParticipation.upsert({
      user_id: userId,
      game_type: gameType,
      game_date: today,
      slot,
      word,
      answered,
      correct,
      points_earned: pointsEarned,
      response_time: responseTime
    });
    console.log(
      `Записано участие пользователя ${userId} в игре "${gameType}" для "${word}" (slot=${slot}): ответил=${answered}, правильно=${correct}`
    );
    return true;
  } catch (error) {
    console.error(`Ошибка записи участия (${gameType}):`, error.message);
    return false;
  }
}

export function recordWordGameParticipation(
  userId,
  word,
  answered,
  correct,
  pointsEarned = 0,
  responseTime = null,
  slot = 'default'
) {
  return recordGameParticipation({
    userId,
    word,
    answered,
    correct,
    pointsEarned,
    responseTime,
    gameType: GAME_TYPES.WORD,
    slot
  });
}

export function recordIdiomGameParticipation(
  userId,
  idiom,
  answered,
  correct,
  pointsEarned = 0,
  responseTime = null,
  slot = 'default'
) {
  return recordGameParticipation({
    userId,
    word: idiom,
    answered,
    correct,
    pointsEarned,
    responseTime,
    gameType: GAME_TYPES.IDIOM,
    slot
  });
}

export function recordPhrasalVerbGameParticipation(
  userId,
  phrasalVerb,
  answered,
  correct,
  pointsEarned = 0,
  responseTime = null,
  slot = 'default'
) {
  return recordGameParticipation({
    userId,
    word: phrasalVerb,
    answered,
    correct,
    pointsEarned,
    responseTime,
    gameType: GAME_TYPES.PHRASAL_VERB,
    slot
  });
}

export function recordQuizGameParticipation(
  userId,
  question,
  answered,
  correct,
  pointsEarned = 0,
  responseTime = null,
  slot = 'default'
) {
  return recordGameParticipation({
    userId,
    word: question,
    answered,
    correct,
    pointsEarned,
    responseTime,
    gameType: GAME_TYPES.QUIZ,
    slot
  });
}

/**
 * Получает статистику участия в ежедневной игре за определенную дату
 * @param {string} date - Дата в формате YYYY-MM-DD (по умолчанию сегодня)
 */
async function getDailyGameStats(gameType, date = null, slot = null) {
  try {
    const targetDate = resolveDate(date);
    console.log(`Getting stats for ${gameType} game on ${targetDate}`);

    const stats = await WordGameParticipation.findAll({
      where: {
        game_date: targetDate,
        game_type: gameType,
        ...(slot ? { slot } : {})
      },
      include: [{
        model: User,
        as: 'User',
        attributes: ['telegram_id', 'username', 'first_name'],
        required: false // Changed to false to include records even if user doesn't exist
      }]
    });
    
    console.log(`Found ${stats.length} participation records`);

    const totalParticipants = stats.length;
    const answeredCount = stats.filter(s => s.answered).length;
    const correctCount = stats.filter(s => s.correct).length;
    const totalPoints = stats.reduce((sum, s) => sum + (s.points_earned || 0), 0);

    const result = {
      gameType,
      date: targetDate,
      totalParticipants,
      answeredCount,
      correctCount,
      unansweredCount: totalParticipants - answeredCount,
      accuracy: answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0,
      totalPoints,
      participants: stats
    };
    
    console.log('Stats result:', result);
    return result;
  } catch (error) {
    console.error(`Ошибка получения статистики игры (${gameType}):`, error.message);
    console.error('Full error:', error);
    return null;
  }
}

export function getDailyWordGameStats(date = null, slot = null) {
  return getDailyGameStats(GAME_TYPES.WORD, date, slot);
}

export function getDailyIdiomGameStats(date = null, slot = null) {
  return getDailyGameStats(GAME_TYPES.IDIOM, date, slot);
}

export function getDailyPhrasalVerbGameStats(date = null, slot = null) {
  return getDailyGameStats(GAME_TYPES.PHRASAL_VERB, date, slot);
}

export function getDailyQuizGameStats(date = null, slot = null) {
  return getDailyGameStats(GAME_TYPES.QUIZ, date, slot);
}

export async function hasUserAnsweredWordGame(userId, slot = 'default', date = null) {
  try {
    const targetDate = resolveDate(date);
    const participation = await WordGameParticipation.findOne({
      where: {
        user_id: userId,
        game_type: GAME_TYPES.WORD,
        game_date: targetDate,
        slot
      }
    });
    return participation?.answered === true;
  } catch (error) {
    console.error('Ошибка проверки статуса ответа в игре слов:', error.message);
    return false;
  }
}

/**
 * Получает статистику участия пользователя в играх за период
 * @param {number} userId - ID пользователя
 * @param {number} days - Количество дней назад (по умолчанию 7)
 */
export async function getUserWordGameStats(userId, days = 7) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const stats = await WordGameParticipation.findAll({
      where: {
        user_id: userId,
        game_type: GAME_TYPES.WORD,
        game_date: {
          [Op.gte]: startDate.toISOString().split('T')[0]
        }
      },
      order: [['game_date', 'DESC']]
    });
    
    const totalGames = stats.length;
    const answeredGames = stats.filter(s => s.answered).length;
    const correctGames = stats.filter(s => s.correct).length;
    const totalPoints = stats.reduce((sum, s) => sum + s.points_earned, 0);
    
    return {
      userId,
      period: `${days} дней`,
      totalGames,
      answeredGames,
      correctGames,
      missedGames: totalGames - answeredGames,
      accuracy: answeredGames > 0 ? Math.round((correctGames / answeredGames) * 100) : 0,
      totalPoints,
      games: stats
    };
  } catch (error) {
    console.error('Ошибка получения статистики пользователя:', error.message);
    return null;
  }
}

/**
 * Получает топ участников по очкам за определенную дату
 * @param {string} date - Дата в формате YYYY-MM-DD (по умолчанию сегодня)
 * @param {number} limit - Количество участников в топе (по умолчанию 10)
 */
export async function getDailyWordGameLeaderboard(date = null, limit = 10) {
  try {
    const targetDate = resolveDate(date);
    
    const leaderboard = await WordGameParticipation.findAll({
      where: {
        game_date: targetDate,
        game_type: GAME_TYPES.WORD,
        answered: true
      },
      include: [{
        model: User,
        as: 'User',
        attributes: ['telegram_id', 'username', 'first_name'],
        required: true
      }],
      order: [['points_earned', 'DESC'], ['response_time', 'ASC']],
      limit: limit
    });
    
    return leaderboard;
  } catch (error) {
    console.error('Ошибка получения топа участников:', error.message);
    return [];
  }
}

/** Названия типов игр для отчёта */
const GAME_TYPE_LABELS = {
  [GAME_TYPES.WORD]: 'Слово',
  [GAME_TYPES.IDIOM]: 'Идиома',
  [GAME_TYPES.PHRASAL_VERB]: 'Phrasal',
  [GAME_TYPES.QUIZ]: 'Квиз'
};

/**
 * Список пользователей, которые участвовали хотя бы в одной игре за день, с перечнем игр и результатами.
 * Только игравшие — тех, кто не играл, в отчёт не включаем.
 * @param {string} date - Дата YYYY-MM-DD (по умолчанию сегодня)
 * @returns {Promise<Array<{ userId, user, games }>>}
 */
export async function getDailyParticipantsByUser(date = null) {
  try {
    const targetDate = resolveDate(date);
    const participations = await WordGameParticipation.findAll({
      where: { game_date: targetDate },
      include: [{
        model: User,
        as: 'User',
        attributes: ['telegram_id', 'username', 'first_name'],
        required: false
      }]
    });

    const byUser = new Map();
    for (const p of participations) {
      const uid = p.user_id;
      if (!byUser.has(uid)) {
        byUser.set(uid, {
          userId: uid,
          user: p.User || { telegram_id: uid, username: null, first_name: `ID:${uid}` },
          games: []
        });
      }
      byUser.get(uid).games.push({
        gameType: p.game_type,
        label: GAME_TYPE_LABELS[p.game_type] || p.game_type,
        answered: p.answered,
        correct: p.correct,
        points: p.points_earned || 0
      });
    }

    return Array.from(byUser.values());
  } catch (error) {
    console.error('Ошибка getDailyParticipantsByUser:', error.message);
    return [];
  }
}

export async function saveDailyWordData(wordData, slot = 'default', date = null) {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const defaults = {
      game_date: targetDate,
      slot,
      word: wordData.word,
      translation: wordData.translation || '',
      options: wordData.options,
      correct_index: Number.isInteger(wordData.correctIndex) ? wordData.correctIndex : 0,
      example: wordData.example,
      fact: wordData.fact,
      mistakes: wordData.mistakes
    };

    const [record, created] = await DailyWordGame.findOrCreate({
      where: { game_date: targetDate, slot },
      defaults
    });

    if (!created) {
      await record.update(defaults);
    }

    console.log(`💾 Слово дня сохранено: ${wordData.word} (${targetDate}, ${slot})`);
    return record.get({ plain: true });
  } catch (error) {
    console.error('Ошибка сохранения слова дня:', error.message);
    return null;
  }
}

export async function getSavedDailyWordData(date = null, slot = 'default', id = null) {
  try {
    let record = null;
    if (id) {
      record = await DailyWordGame.findByPk(id);
    } else {
      const targetDate = date || new Date().toISOString().split('T')[0];
      record = await DailyWordGame.findOne({
        where: { game_date: targetDate, slot }
      });
    }

    if (!record) {
      return null;
    }

    const options = Array.isArray(record.options) ? record.options : [];
    const translation = record.translation || '';
    const lowerTranslation = translation.toLowerCase();
    let correctIndex = typeof record.correct_index === 'number' ? record.correct_index : -1;
    if (correctIndex < 0 || correctIndex >= options.length) {
      correctIndex = options.findIndex(
        option => option?.toLowerCase?.() === lowerTranslation
      );
      if (correctIndex === -1) {
        correctIndex = 0;
      }
    }

    return {
      id: record.id,
      slot: record.slot,
      game_date: record.game_date,
      word: record.word,
      translation,
      options,
      correctIndex,
      example: record.example,
      fact: record.fact,
      mistakes: record.mistakes
    };
  } catch (error) {
    console.error('Ошибка получения слова дня из базы:', error.message);
    return null;
  }
}

/**
 * Получает расширенную статистику за период для всех типов игр
 * @param {string} startDate - Начальная дата в формате YYYY-MM-DD
 * @param {string} endDate - Конечная дата в формате YYYY-MM-DD (по умолчанию сегодня)
 * @param {string} gameType - Тип игры (опционально, если не указан - все типы)
 */
export async function getPeriodStats(startDate, endDate = null, gameType = null) {
  try {
    const end = endDate || new Date().toISOString().split('T')[0];
    
    const whereClause = {
      game_date: {
        [Op.gte]: startDate,
        [Op.lte]: end
      }
    };
    
    if (gameType) {
      whereClause.game_type = gameType;
    }

    const stats = await WordGameParticipation.findAll({
      where: whereClause,
      include: [{
        model: User,
        as: 'User',
        attributes: ['telegram_id', 'username', 'first_name'],
        required: false
      }],
      order: [['game_date', 'DESC']]
    });

    // Группировка по типам игр
    const byGameType = {};
    const byDate = {};
    const byUser = {};
    
    stats.forEach(stat => {
      const type = stat.game_type;
      const date = stat.game_date;
      const userId = stat.user_id;
      
      // По типам игр
      if (!byGameType[type]) {
        byGameType[type] = {
          total: 0,
          answered: 0,
          correct: 0,
          totalPoints: 0,
          avgResponseTime: 0,
          responseTimes: []
        };
      }
      byGameType[type].total++;
      if (stat.answered) {
        byGameType[type].answered++;
        if (stat.correct) byGameType[type].correct++;
        if (stat.response_time) {
          byGameType[type].responseTimes.push(stat.response_time);
        }
      }
      byGameType[type].totalPoints += stat.points_earned || 0;
      
      // По датам
      if (!byDate[date]) {
        byDate[date] = {
          total: 0,
          answered: 0,
          correct: 0,
          totalPoints: 0
        };
      }
      byDate[date].total++;
      if (stat.answered) {
        byDate[date].answered++;
        if (stat.correct) byDate[date].correct++;
      }
      byDate[date].totalPoints += stat.points_earned || 0;
      
      // По пользователям
      if (!byUser[userId]) {
        byUser[userId] = {
          user: stat.User,
          total: 0,
          answered: 0,
          correct: 0,
          totalPoints: 0,
          games: []
        };
      }
      byUser[userId].total++;
      if (stat.answered) {
        byUser[userId].answered++;
        if (stat.correct) byUser[userId].correct++;
      }
      byUser[userId].totalPoints += stat.points_earned || 0;
      byUser[userId].games.push(stat);
    });

    // Вычисление среднего времени ответа для каждого типа игры
    Object.keys(byGameType).forEach(type => {
      const times = byGameType[type].responseTimes;
      if (times.length > 0) {
        byGameType[type].avgResponseTime = Math.round(
          times.reduce((a, b) => a + b, 0) / times.length
        );
      }
    });

    // Вычисление процентов
    Object.keys(byGameType).forEach(type => {
      const data = byGameType[type];
      data.participationRate = data.total > 0 
        ? Math.round((data.answered / data.total) * 100) 
        : 0;
      data.accuracy = data.answered > 0 
        ? Math.round((data.correct / data.answered) * 100) 
        : 0;
    });

    return {
      period: { startDate, endDate: end },
      summary: {
        totalGames: stats.length,
        uniqueUsers: Object.keys(byUser).length,
        totalAnswered: stats.filter(s => s.answered).length,
        totalCorrect: stats.filter(s => s.correct).length,
        totalPoints: stats.reduce((sum, s) => sum + (s.points_earned || 0), 0)
      },
      byGameType,
      byDate,
      byUser: Object.values(byUser).sort((a, b) => b.totalPoints - a.totalPoints),
      rawStats: stats
    };
  } catch (error) {
    console.error('Ошибка получения статистики за период:', error.message);
    return null;
  }
}

/**
 * Получает детальную статистику конкретного пользователя за период
 * @param {number} userId - ID пользователя
 * @param {string} startDate - Начальная дата (опционально)
 * @param {string} endDate - Конечная дата (опционально)
 * @param {number} days - Количество дней назад (если не указаны даты)
 */
export async function getUserDetailedStats(userId, startDate = null, endDate = null, days = 30) {
  try {
    let whereClause = { user_id: userId };
    
    if (startDate && endDate) {
      whereClause.game_date = {
        [Op.gte]: startDate,
        [Op.lte]: endDate
      };
    } else if (startDate) {
      whereClause.game_date = { [Op.gte]: startDate };
    } else {
      const start = new Date();
      start.setDate(start.getDate() - days);
      whereClause.game_date = { [Op.gte]: start.toISOString().split('T')[0] };
    }

    const stats = await WordGameParticipation.findAll({
      where: whereClause,
      include: [{
        model: User,
        as: 'User',
        attributes: ['telegram_id', 'username', 'first_name', 'points'],
        required: false
      }],
      order: [['game_date', 'DESC'], ['game_type', 'ASC']]
    });

    if (stats.length === 0) {
      return null;
    }

    // Группировка по типам игр
    const byGameType = {};
    const byDate = {};
    const responseTimes = [];
    
    stats.forEach(stat => {
      const type = stat.game_type;
      const date = stat.game_date;
      
      if (!byGameType[type]) {
        byGameType[type] = {
          total: 0,
          answered: 0,
          correct: 0,
          totalPoints: 0,
          responseTimes: []
        };
      }
      byGameType[type].total++;
      if (stat.answered) {
        byGameType[type].answered++;
        if (stat.correct) byGameType[type].correct++;
        if (stat.response_time) {
          byGameType[type].responseTimes.push(stat.response_time);
          responseTimes.push(stat.response_time);
        }
      }
      byGameType[type].totalPoints += stat.points_earned || 0;
      
      if (!byDate[date]) {
        byDate[date] = {
          total: 0,
          answered: 0,
          correct: 0,
          totalPoints: 0
        };
      }
      byDate[date].total++;
      if (stat.answered) {
        byDate[date].answered++;
        if (stat.correct) byDate[date].correct++;
      }
      byDate[date].totalPoints += stat.points_earned || 0;
    });

    // Вычисление метрик
    Object.keys(byGameType).forEach(type => {
      const data = byGameType[type];
      data.participationRate = data.total > 0 
        ? Math.round((data.answered / data.total) * 100) 
        : 0;
      data.accuracy = data.answered > 0 
        ? Math.round((data.correct / data.answered) * 100) 
        : 0;
      if (data.responseTimes.length > 0) {
        data.avgResponseTime = Math.round(
          data.responseTimes.reduce((a, b) => a + b, 0) / data.responseTimes.length
        );
      }
    });

    const totalGames = stats.length;
    const answeredGames = stats.filter(s => s.answered).length;
    const correctGames = stats.filter(s => s.correct).length;
    const totalPoints = stats.reduce((sum, s) => sum + (s.points_earned || 0), 0);
    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null;

    return {
      user: stats[0].User,
      period: {
        startDate: startDate || (stats.length > 0 ? stats[stats.length - 1].game_date : null),
        endDate: endDate || (stats.length > 0 ? stats[0].game_date : null),
        days: stats.length > 0 ? new Set(stats.map(s => s.game_date)).size : 0
      },
      summary: {
        totalGames,
        answeredGames,
        correctGames,
        missedGames: totalGames - answeredGames,
        participationRate: totalGames > 0 ? Math.round((answeredGames / totalGames) * 100) : 0,
        accuracy: answeredGames > 0 ? Math.round((correctGames / answeredGames) * 100) : 0,
        totalPoints,
        avgResponseTime
      },
      byGameType,
      byDate,
      games: stats
    };
  } catch (error) {
    console.error('Ошибка получения детальной статистики пользователя:', error.message);
    return null;
  }
}

/**
 * Получает топ самых активных пользователей за период
 * @param {number} limit - Количество пользователей в топе (по умолчанию 10)
 * @param {number} days - Количество дней назад (по умолчанию 30)
 */
export async function getTopActiveUsers(limit = 10, days = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const stats = await WordGameParticipation.findAll({
      where: {
        game_date: {
          [Op.gte]: startDate.toISOString().split('T')[0]
        }
      },
      include: [{
        model: User,
        as: 'User',
        attributes: ['telegram_id', 'username', 'first_name', 'points'],
        required: false
      }]
    });

    // Группировка по пользователям
    const userStats = {};
    
    stats.forEach(stat => {
      const userId = stat.user_id;
      if (!userStats[userId]) {
        userStats[userId] = {
          user: stat.User,
          totalGames: 0,
          answeredGames: 0,
          correctGames: 0,
          totalPoints: 0,
          uniqueDays: new Set()
        };
      }
      userStats[userId].totalGames++;
      userStats[userId].uniqueDays.add(stat.game_date);
      if (stat.answered) {
        userStats[userId].answeredGames++;
        if (stat.correct) userStats[userId].correctGames++;
      }
      userStats[userId].totalPoints += stat.points_earned || 0;
    });

    // Преобразование в массив и вычисление метрик
    const topUsers = Object.values(userStats)
      .map(data => ({
        user: data.user,
        totalGames: data.totalGames,
        answeredGames: data.answeredGames,
        correctGames: data.correctGames,
        totalPoints: data.totalPoints,
        activeDays: data.uniqueDays.size,
        participationRate: data.totalGames > 0 
          ? Math.round((data.answeredGames / data.totalGames) * 100) 
          : 0,
        accuracy: data.answeredGames > 0 
          ? Math.round((data.correctGames / data.answeredGames) * 100) 
          : 0
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, limit);

    return topUsers;
  } catch (error) {
    console.error('Ошибка получения топа активных пользователей:', error.message);
    return [];
  }
}

/**
 * Сравнивает статистику двух периодов
 * @param {string} period1Start - Начало первого периода
 * @param {string} period1End - Конец первого периода
 * @param {string} period2Start - Начало второго периода
 * @param {string} period2End - Конец второго периода
 */
export async function comparePeriods(period1Start, period1End, period2Start, period2End) {
  try {
    const [stats1, stats2] = await Promise.all([
      getPeriodStats(period1Start, period1End),
      getPeriodStats(period2Start, period2End)
    ]);

    if (!stats1 || !stats2) {
      return null;
    }

    const calculateChange = (oldVal, newVal) => {
      if (oldVal === 0) return newVal > 0 ? 100 : 0;
      return Math.round(((newVal - oldVal) / oldVal) * 100);
    };

    return {
      period1: {
        dates: { start: period1Start, end: period1End },
        summary: stats1.summary
      },
      period2: {
        dates: { start: period2Start, end: period2End },
        summary: stats2.summary
      },
      changes: {
        totalGames: calculateChange(stats1.summary.totalGames, stats2.summary.totalGames),
        uniqueUsers: calculateChange(stats1.summary.uniqueUsers, stats2.summary.uniqueUsers),
        totalAnswered: calculateChange(stats1.summary.totalAnswered, stats2.summary.totalAnswered),
        totalCorrect: calculateChange(stats1.summary.totalCorrect, stats2.summary.totalCorrect),
        totalPoints: calculateChange(stats1.summary.totalPoints, stats2.summary.totalPoints)
      }
    };
  } catch (error) {
    console.error('Ошибка сравнения периодов:', error.message);
    return null;
  }
}
