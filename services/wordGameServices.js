// services/wordGameServices.js
import WordGameParticipation from '../models/WordGameParticipation.js';
import DailyWordGame from '../models/DailyWordGame.js';
import User from '../models/User.js';
import { Op } from 'sequelize';

export const GAME_TYPES = {
  WORD: 'word',
  IDIOM: 'idiom',
  PHRASAL_VERB: 'phrasal_verb'
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
