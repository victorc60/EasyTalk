// init/migrateStreaks.js
// Одноразовая миграция: переносит streaks.json → таблицу streaks в MySQL.
// После успешной миграции файл больше не нужен (данные живут в DB).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Streak from '../models/Streak.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STREAKS_FILE = path.resolve(__dirname, '../data/streaks.json');

export async function migrateStreaksFromJson() {
  if (!fs.existsSync(STREAKS_FILE)) return;

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(STREAKS_FILE, 'utf8'));
  } catch {
    console.warn('[STREAK] streaks.json повреждён, миграция пропущена');
    return;
  }

  const entries = Object.entries(raw);
  if (entries.length === 0) return;

  let migrated = 0;
  for (const [userId, userData] of entries) {
    // Поддержка старого формата { count, lastDate } → { word: { count, lastDate } }
    const gameStreaks = (typeof userData.count === 'number' || userData.lastDate !== undefined)
      ? { word: userData }
      : userData;

    for (const [gameType, data] of Object.entries(gameStreaks)) {
      if (!data || typeof data.count !== 'number') continue;
      try {
        await Streak.upsert({
          user_id: BigInt(userId),
          game_type: gameType,
          count: data.count || 0,
          last_date: data.lastDate || null
        });
        migrated++;
      } catch (err) {
        console.warn(`[STREAK] Не удалось мигрировать userId=${userId} gameType=${gameType}: ${err.message}`);
      }
    }
  }

  if (migrated > 0) {
    console.log(`[STREAK] Мигрировано ${migrated} стриков из streaks.json → MySQL`);
    // Переименовываем файл чтобы не мигрировать повторно
    try {
      fs.renameSync(STREAKS_FILE, STREAKS_FILE + '.migrated');
    } catch {
      // не критично
    }
  }
}
