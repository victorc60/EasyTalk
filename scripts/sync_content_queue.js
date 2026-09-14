import 'dotenv/config';
import sequelize from '../database/database.js';
import ContentQueue from '../models/ContentQueue.js';
import { QUEUE_BANKS, readQueueBank, synchronizeQueueBank } from '../services/queueImportService.js';
import { queueFingerprint } from '../services/contentIdentityService.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const types = args.filter(arg => !arg.startsWith('--'));
try {
  if (types.some(type => !QUEUE_BANKS.some(bank => bank.type === type))) throw new Error('Unknown queue type');
  await sequelize.authenticate();
  for (const spec of QUEUE_BANKS.filter(bank => !types.length || types.includes(bank.type))) {
    if (!dryRun) console.log('[QUEUE:SYNC]', await synchronizeQueueBank(spec));
    else {
      const existing = await ContentQueue.findAll({ where: { type: spec.type } });
      const seen = new Set(existing.map(row => queueFingerprint(spec.type, row.content)));
      let missing = 0;
      for (const item of readQueueBank(spec.file)) {
        const key = queueFingerprint(spec.type, item);
        if (!seen.has(key)) { missing++; seen.add(key); }
      }
      console.log('[QUEUE:DRY-RUN]', spec.type, { missing });
    }
  }
} catch (error) {
  console.error('[QUEUE:SYNC]', error.message);
  process.exitCode = 1;
} finally { await sequelize.close(); }
