// cron/dailyCron.js
import cron from 'node-cron';
import { runDailyContent } from '../services/dailyContentService.js';

const TZ = 'Europe/Chisinau';

/**
 * Инициализирует ежедневные задания очереди контента.
 * Расписание (по Кишинёву):
 *   08:00 — Word of the Day
 *   10:00 — Daily Quiz
 *   12:00 — Daily Idiom
 *   15:00 — Phrasal Verb of the Day
 *   18:00 — Daily Fact
 */
export function setupDailyCron(bot) {
  console.log('[CRON] Настройка ежедневного расписания очереди контента...');

  // Word of the Day — 08:00
  cron.schedule('0 8 * * *', () => {
    console.log('[CRON] Запуск Word of the Day (08:00)');
    runDailyContent(bot, 'word').catch(err =>
      console.error('[CRON] Ошибка word:', err.message)
    );
  }, { timezone: TZ });

  // Daily Quiz — 10:00
  cron.schedule('0 10 * * *', () => {
    console.log('[CRON] Запуск Daily Quiz (10:00)');
    runDailyContent(bot, 'quiz').catch(err =>
      console.error('[CRON] Ошибка quiz:', err.message)
    );
  }, { timezone: TZ });

  // Daily Idiom — 12:00
  cron.schedule('0 12 * * *', () => {
    console.log('[CRON] Запуск Daily Idiom (12:00)');
    runDailyContent(bot, 'idiom').catch(err =>
      console.error('[CRON] Ошибка idiom:', err.message)
    );
  }, { timezone: TZ });

  // Phrasal Verb of the Day — 15:00
  cron.schedule('0 15 * * *', () => {
    console.log('[CRON] Запуск Phrasal Verb of the Day (15:00)');
    runDailyContent(bot, 'phrasal').catch(err =>
      console.error('[CRON] Ошибка phrasal:', err.message)
    );
  }, { timezone: TZ });

  // Daily Fact — 18:00
  cron.schedule('0 18 * * *', () => {
    console.log('[CRON] Запуск Daily Fact (18:00)');
    runDailyContent(bot, 'fact').catch(err =>
      console.error('[CRON] Ошибка fact:', err.message)
    );
  }, { timezone: TZ });

  console.log('[CRON] ✅ Расписание настроено: слово(08:00), квиз(10:00), идиома(12:00), фразал(15:00), факт(18:00)');
}
