import ContentIdentity from '../models/ContentIdentity.js';
import ContentQueue from '../models/ContentQueue.js';
import { contentFingerprint } from './bankContentRules.js';

export function queueFingerprint(type, content) {
  const bank = type === 'phrasal' ? 'phrasal_verb' : type;
  return contentFingerprint(bank, type === 'phrasal' ? { ...content, phrasalVerb: content.phrasalVerb || content.verb } : content);
}

export async function lockContentIdentity(type, content, transaction) {
  const fingerprint = queueFingerprint(type, content);
  await ContentIdentity.findOrCreate({ where: { fingerprint }, defaults: { fingerprint }, transaction });
  return ContentIdentity.findByPk(fingerprint, { transaction, lock: transaction.LOCK.UPDATE });
}

export async function appendQueueRecord(record, transaction) {
  const identity = await lockContentIdentity(record.type, record.content, transaction);
  if (identity.queue_id) return false;
  const row = await ContentQueue.create({ ...record, used: Boolean(identity.used_at) || record.used, used_at: identity.used_at || record.used_at }, { transaction });
  await identity.update({ queue_id: row.id }, { transaction });
  return true;
}
