import sequelize from '../database/database.js';
import ContentQueue from '../models/ContentQueue.js';
import { pickFromBank } from '../utils/bankUtils.js';
import { lockContentIdentity } from './contentIdentityService.js';

export async function pickUnusedLegacyItem(type, file) {
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
