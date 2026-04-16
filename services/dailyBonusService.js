// services/dailyBonusService.js
import WordGameParticipation from '../models/WordGameParticipation.js';
import DailyBonus from '../models/DailyBonus.js';
import { awardPoints } from './userServices.js';
import { hasCompletedAllGames, BONUS_GAMES, BONUS_POINTS } from './dailyBonusHelpers.js';

export { hasCompletedAllGames, BONUS_GAMES, BONUS_POINTS };

/**
 * Returns which BONUS_GAMES the user has already answered today
 * and whether the bonus was already awarded.
 */
export async function getDailyBonusProgress(userId, gameDate) {
  try {
    const existing = await DailyBonus.findOne({
      where: { user_id: userId, bonus_date: gameDate }
    });
    if (existing) {
      return { alreadyAwarded: true, answeredGames: [...BONUS_GAMES] };
    }

    const participations = await WordGameParticipation.findAll({
      where: {
        user_id: userId,
        game_date: gameDate,
        game_type: BONUS_GAMES,
        answered: true
      },
      attributes: ['game_type'],
      raw: true
    });

    const answeredGames = [...new Set(participations.map(p => p.game_type))];
    return { alreadyAwarded: false, answeredGames };

  } catch (err) {
    console.error(`getDailyBonusProgress error userId=${userId}:`, err.message);
    return { alreadyAwarded: false, answeredGames: [] };
  }
}

/**
 * Checks if the user completed all 4 games today.
 * If yes — awards 20 bonus points (once per day).
 * Returns true if bonus was just awarded, false otherwise.
 */
export async function checkAndAwardDailyBonus(userId, gameDate) {
  try {
    // Already awarded today?
    const existing = await DailyBonus.findOne({
      where: { user_id: userId, bonus_date: gameDate }
    });
    if (existing) return false;

    // Fetch today's answered games for this user
    const participations = await WordGameParticipation.findAll({
      where: {
        user_id: userId,
        game_date: gameDate,
        game_type: BONUS_GAMES,
        answered: true
      },
      attributes: ['game_type', 'answered'],
      raw: true
    });

    if (!hasCompletedAllGames(participations)) return false;

    // Award — create record first to block race conditions
    await DailyBonus.create({ user_id: userId, bonus_date: gameDate, points: BONUS_POINTS });
    await awardPoints(userId, BONUS_POINTS);

    console.log(`🎉 Daily bonus +${BONUS_POINTS} pts → userId=${userId} date=${gameDate}`);
    return true;

  } catch (err) {
    // Unique constraint = race condition, already awarded
    if (err.name === 'SequelizeUniqueConstraintError') return false;
    console.error(`checkAndAwardDailyBonus error userId=${userId}:`, err.message);
    return false;
  }
}
