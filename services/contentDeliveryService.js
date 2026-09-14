import sequelize from '../database/database.js';
import { Op } from 'sequelize';
import User from '../models/User.js';
import DailyLog from '../models/DailyLog.js';
import ContentQueue from '../models/ContentQueue.js';
import ContentDelivery from '../models/ContentDelivery.js';
import { lockContentIdentity } from './contentIdentityService.js';

export async function prepareContentDelivery(type, date) {
  try {
    return await sequelize.transaction(async transaction => {
      const existing = await DailyLog.findOne({ where: { type, date }, transaction });
      if (existing) return existing;
      let queue = await ContentQueue.findOne({ where: { type, used: false }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
      while (queue) {
        const identity = await lockContentIdentity(type, queue.content, transaction);
        if (!identity.used_at) {
          await identity.update({ used_at: new Date(), queue_id: identity.queue_id || queue.id }, { transaction });
          break;
        }
        await queue.update({ used: true, used_at: identity.used_at }, { transaction });
        queue = await ContentQueue.findOne({ where: { type, used: false }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
      }
      if (!queue) return null;
      const publication = await DailyLog.create({ type, date, content_id: queue.content_id }, { transaction });
      const users = await User.findAll({ where: { is_active: true }, attributes: ['telegram_id'], transaction });
      await ContentDelivery.bulkCreate(users.map(user => ({
        daily_log_id: publication.id, queue_id: queue.id, user_id: user.telegram_id, status: 'pending',
      })), { transaction });
      await queue.update({ used: true, used_at: new Date() }, { transaction });
      return publication;
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') return DailyLog.findOne({ where: { type, date } });
    throw error;
  }
}

export async function deliverPendingContent(bot, publication, buildMessage) {
  const deliveries = await ContentDelivery.findAll({ where: { daily_log_id: publication.id, status: 'pending', retry_at: { [Op.lte]: new Date() } }, order: [['id', 'ASC']] });
  for (const delivery of deliveries) {
    const queue = await ContentQueue.findByPk(delivery.queue_id);
    if (!queue) throw new Error('Delivery content is missing');
    const { text, reply_markup } = buildMessage(queue);
    const [claimed] = await ContentDelivery.update({ status: 'sending' }, { where: { id: delivery.id, status: 'pending', retry_at: { [Op.lte]: new Date() } } });
    if (!claimed) continue;
    try {
      const message = await bot.sendMessage(delivery.user_id, text, { parse_mode: 'HTML', reply_markup });
      await delivery.update({ status: 'sent', message_id: message.message_id });
    } catch (error) {
      const code = error?.response?.body?.error_code;
      const status = code === 429 ? 'pending' : code === 403 || code === 400 ? 'failed' : 'unknown';
      const retrySeconds = Number(error?.response?.body?.parameters?.retry_after) || 60;
      await delivery.update({ status, retry_at: new Date(Date.now() + Math.max(60, retrySeconds) * 1000) });
      if (code === 403) await User.update({ is_active: false }, { where: { telegram_id: delivery.user_id } });
      console.warn('[DELIVERY]', delivery.id, status, code || 'transport');
      if (code === 429) return;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}
