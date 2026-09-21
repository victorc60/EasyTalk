import sequelize from '../database/database.js';
import ContentQueue from '../models/ContentQueue.js';
import { pickFromBank } from '../utils/bankUtils.js';
import { lockContentIdentity } from './contentIdentityService.js';

export async function pickUnusedLegacyItem(type, file) {
  // Generated items live in MySQL. Lock the queue before its identity, matching
  // scheduled delivery, so either route can consume a text only once.
  const queued = await sequelize.transaction(async transaction => {
    while (true) {
      const row = await ContentQueue.findOne({
        where: { type, used: false }, order: [['id', 'ASC']],
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!row) return null;
      const identity = await lockContentIdentity(type, row.content, transaction);
      const wasUsed = Boolean(identity.used_at);
      const usedAt = identity.used_at || new Date();
      await row.update({ used: true, used_at: usedAt }, { transaction });
      if (wasUsed) continue;
      await identity.update({ used_at: usedAt }, { transaction });
      return { ...row.content, phrasalVerb: row.content.phrasalVerb || row.content.verb };
    }
  });
  if (queued) return queued;
  let item;
  while ((item = pickFromBank(file))) {
    const claim = await sequelize.transaction(async transaction => {
      const identity = await lockContentIdentity(type, item, transaction);
      if (identity.used_at) return null;
      await identity.update({ used_at: new Date() }, { transaction });
      return { queueId: identity.queue_id, usedAt: identity.used_at };
    });
    if (!claim) continue;
    // Do not acquire queue locks while holding an identity lock: delivery locks
    // in the opposite order. The durable identity already prevents publication.
    if (claim.queueId) await ContentQueue.update({ used: true, used_at: claim.usedAt }, { where: { id: claim.queueId } });
    return item;
  }
  return null;
}
