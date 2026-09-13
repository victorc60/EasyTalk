import sequelize from '../database/database.js';
import User from '../models/User.js';
import ContentQueue from '../models/ContentQueue.js';
import DailyLog from '../models/DailyLog.js';
import WordGameParticipation from '../models/WordGameParticipation.js';
import { awardDailyBonusInTransaction } from './dailyBonusService.js';
import { evaluateQueueAnswer } from './answerRules.js';

export async function submitQueueAnswer({ userId, type, queueId, answer, gameDate }) {
  return sequelize.transaction(async (transaction) => {
    const user = await User.findOne({ where: { telegram_id: userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!user) throw new Error('User not found');
    const row = await ContentQueue.findByPk(queueId, { transaction });
    if (!row || row.type !== type) throw new Error('Question not found');
    const publication = await DailyLog.findOne({ where: { type, date: gameDate, content_id: row.content_id }, transaction });
    if (!publication) throw new Error('This question is not active today');
    const where = { user_id: userId, game_type: `q_${type}`, slot: 'queue', game_date: gameDate };
    const existing = await WordGameParticipation.findOne({ where, transaction });
    if (existing?.answered) return { duplicate: true };
    const { correct, points } = evaluateQueueAnswer(type, row.content, answer);
    const item = row.content;
    const word = String(item.word || item.idiom || item.verb || item.phrasalVerb || item.question || item.claim || '').slice(0, 100);
    const values = { ...where, word, answered: true, correct, points_earned: points, response_time: null };
    if (existing) await existing.update(values, { transaction });
    else await WordGameParticipation.create(values, { transaction });
    if (points) await user.increment('points', { by: points, transaction });
    const bonus = await awardDailyBonusInTransaction(userId, gameDate, transaction);
    return { duplicate: false, correct, points, bonus, item };
  });
}
