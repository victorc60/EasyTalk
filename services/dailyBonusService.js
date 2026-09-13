import sequelize from '../database/database.js';
import User from '../models/User.js';
import WordGameParticipation from '../models/WordGameParticipation.js';
import DailyBonus from '../models/DailyBonus.js';
import { hasCompletedAllGames, BONUS_GAMES, BONUS_POINTS, normalizeBonusGame } from './dailyBonusHelpers.js';

export { hasCompletedAllGames, BONUS_GAMES, BONUS_POINTS };

export async function getDailyBonusProgress(userId, gameDate) {
  const existing = await DailyBonus.findOne({ where: { user_id: userId, bonus_date: gameDate } });
  if (existing) return { alreadyAwarded: true, answeredGames: [...BONUS_GAMES] };
  const rows = await WordGameParticipation.findAll({
    where: { user_id: userId, game_date: gameDate, answered: true },
    attributes: ['game_type'], raw: true,
  });
  return { alreadyAwarded: false, answeredGames: [...new Set(rows.map(row => normalizeBonusGame(row.game_type)))] };
}

export async function awardDailyBonusInTransaction(userId, gameDate, transaction) {
  const existing = await DailyBonus.findOne({ where: { user_id: userId, bonus_date: gameDate }, transaction });
  if (existing) return false;
  const rows = await WordGameParticipation.findAll({
    where: { user_id: userId, game_date: gameDate, answered: true }, transaction,
  });
  if (!hasCompletedAllGames(rows)) return false;
  await DailyBonus.create({ user_id: userId, bonus_date: gameDate, points: BONUS_POINTS }, { transaction });
  await User.increment('points', { where: { telegram_id: userId }, by: BONUS_POINTS, transaction });
  return true;
}

export async function checkAndAwardDailyBonus(userId, gameDate) {
  return sequelize.transaction(async transaction => {
    const user = await User.findOne({ where: { telegram_id: userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!user) throw new Error('User not found');
    return awardDailyBonusInTransaction(userId, gameDate, transaction);
  });
}
