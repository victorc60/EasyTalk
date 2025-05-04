import schedule from 'node-schedule';
import { dailyFactBroadcast, wordGameBroadcast, cleanupInactiveUsers } from '../services/adminServices.js';
import { CONFIG } from './constants.js';

export function setupSchedules() {
  schedule.scheduleJob(CONFIG.DAILY_FACT_TIME, dailyFactBroadcast);
  schedule.scheduleJob(CONFIG.WORD_GAME_TIME, wordGameBroadcast);
  schedule.scheduleJob(CONFIG.CLEANUP_TIME, cleanupInactiveUsers);
}