// services/wordGameServices.js
import WordGameParticipation from '../models/WordGameParticipation.js';
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
    
    const stats = await WordGameParticipation.findAll({
      where: {
        game_date: targetDate
      },
      include: [{
        model: User,
        attributes: ['telegram_id', 'username', 'first_name'],
        required: true
      }]
    });
    
    const totalParticipants = stats.length;
    const answeredCount = stats.filter(s => s.answered).length;
    const correctCount = stats.filter(s => s.correct).length;
    const totalPoints = stats.reduce((sum, s) => sum + s.points_earned, 0);
    
    return {
      date: targetDate,
      totalParticipants,
      answeredCount,
      correctCount,
      unansweredCount: totalParticipants - answeredCount,
      accuracy: answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0,
      totalPoints,
      participants: stats
    };
  } catch (error) {
    console.error('Ошибка получения статистики игры:', error.message);
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
