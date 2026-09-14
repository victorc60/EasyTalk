import fs from 'node:fs';
import sequelize from '../database/database.js';
import ContentQueue from '../models/ContentQueue.js';
import DailyLog from '../models/DailyLog.js';
import DailyWordGame from '../models/DailyWordGame.js';
import DailyGameSession from '../models/DailyGameSession.js';
import { dataFilePath } from '../utils/projectPaths.js';
import { lockContentIdentity } from './contentIdentityService.js';
import { loadBankToQueue } from './queueService.js';

export const QUEUE_BANKS = [
  { type: 'word', file: 'word_bank.json', history: 'word_history.json', field: 'word' },
  { type: 'idiom', file: 'idiom_bank.json', history: 'idiom_history.json', field: 'idiom' },
  { type: 'phrasal', file: 'phrasal_verbs_bank.json', history: 'phrasal_verbs_history.json', field: 'phrasalVerb' },
  { type: 'quiz', file: 'quiz_bank.json', history: 'quiz_history.json', field: 'question' },
  { type: 'fact', file: 'facts_bank.json', history: 'fact_history.json', field: 'claim' },
];

export function readQueueBank(file, optional = false) {
  const filename = dataFilePath(file);
  if (optional && !fs.existsSync(filename)) return [];
  const rows = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!Array.isArray(rows)) throw new Error('Invalid bank/history: ' + file);
  return rows;
}

export async function synchronizeQueueBank(spec) {
  const bank = readQueueBank(spec.file);
  const history = readQueueBank(spec.history, true);
  const sessions = await DailyGameSession.findAll({ where: { game_type: spec.type === 'phrasal' ? 'phrasal_verb' : spec.type }, attributes: ['prompt'] });
  const previous = [...bank.filter(item => item.isUsed), ...history.map(value => typeof value === 'string' ? { [spec.field]: value } : value), ...sessions.map(row => ({ [spec.field]: row.prompt }))];
  if (spec.type === 'word') {
    const words = await DailyWordGame.findAll({ attributes: ['word'] });
    previous.push(...words.map(row => ({ word: row.word })));
  }
  for (const item of previous) {
    const content = { ...item, [spec.field]: item[spec.field] || (spec.type === 'phrasal' ? item.verb : '') };
    if (!content[spec.field]) continue;
    await sequelize.transaction(async transaction => {
      const identity = await lockContentIdentity(spec.type, content, transaction);
      if (!identity.used_at) await identity.update({ used_at: new Date() }, { transaction });
    });
  }
  const logs = await DailyLog.findAll({ where: { type: spec.type }, attributes: ['content_id'] });
  const published = new Set(logs.map(row => row.content_id));
  const rows = await ContentQueue.findAll({ where: { type: spec.type }, order: [['id', 'ASC']] });
  for (const row of rows) {
    await sequelize.transaction(async transaction => {
      const identity = await lockContentIdentity(spec.type, row.content, transaction);
      const usedAt = identity.used_at || (row.used || published.has(row.content_id) ? row.used_at || new Date() : null);
      await identity.update({ queue_id: identity.queue_id || row.id, used_at: usedAt }, { transaction });
      if (usedAt) await row.update({ used: true, used_at: usedAt }, { transaction });
    });
  }
  const added = await loadBankToQueue(spec.type, bank);
  return { type: spec.type, source: bank.length, added };
}
