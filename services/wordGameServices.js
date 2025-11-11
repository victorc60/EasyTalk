// services/wordGameServices.js
import WordGameParticipation from '../models/WordGameParticipation.js';
import DailyWordGame from '../models/DailyWordGame.js';
import User from '../models/User.js';
import { Op } from 'sequelize';

/**
 * Записывает участие пользователя в ежедневной игре со словами
 * @param {number} userId - ID пользователя в Telegram
 * @param {string} word - Слово дня
 * @param {boolean} answered - Ответил ли пользователь
 * @param {boolean} correct - Правильный ли ответ
 * @param {number} pointsEarned - Заработанные очки
 * @param {number} responseTime - Время ответа в миллисекундах
 */
export async function recordWordGameParticipation(userId, word, answered, correct, pointsEarned = 0, responseTime = null) {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    await WordGameParticipation.upsert({
      user_id: userId,
      game_date: today,
      word: word,
      answered: answered,
      correct: correct,
      points_earned: pointsEarned,
      response_time: responseTime
    });
    
    console.log(`Записано участие пользователя ${userId} в игре со словом "${word}": ответил=${answered}, правильно=${correct}`);
    return true;
  } catch (error) {
    console.error('Ошибка записи участия в игре:', error.message);
    return false;
  }
}

/**
 * Получает статистику участия в ежедневной игре за определенную дату
 * @param {string} date - Дата в формате YYYY-MM-DD (по умолчанию сегодня)
 */
export async function getDailyWordGameStats(date = null) {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    console.log(`Getting stats for date: ${targetDate}`);
    
    const stats = await WordGameParticipation.findAll({
      where: {
        game_date: targetDate
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
    console.error('Ошибка получения статистики игры:', error.message);
    console.error('Full error:', error);
    return null;
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
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const leaderboard = await WordGameParticipation.findAll({
      where: {
        game_date: targetDate,
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

export async function saveDailyWordData(wordData, date = null) {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const payload = {
      game_date: targetDate,
      word: wordData.word,
      translation: wordData.translation || '',
      options: wordData.options,
      correct_index: Number.isInteger(wordData.correctIndex) ? wordData.correctIndex : 0,
      example: wordData.example,
      fact: wordData.fact,
      mistakes: wordData.mistakes
    };
    await DailyWordGame.upsert(payload);
    console.log(`💾 Слово дня сохранено для ${targetDate}: ${wordData.word}`);
    return true;
  } catch (error) {
    console.error('Ошибка сохранения слова дня:', error.message);
    return false;
  }
}

export async function getSavedDailyWordData(date = null) {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const record = await DailyWordGame.findOne({
      where: { game_date: targetDate }
    });
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
