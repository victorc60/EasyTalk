import { QUEUE_BANKS, synchronizeQueueBank } from '../services/queueImportService.js';

export async function initAllQueues() {
  // Fail closed: do not start broadcasts with a partially restored history.
  for (const spec of QUEUE_BANKS) console.log('[QUEUE:SYNC]', await synchronizeQueueBank(spec));
}
