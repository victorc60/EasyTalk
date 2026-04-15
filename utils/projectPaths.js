import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROJECT_ROOT = path.resolve(__dirname, '..');

// DATA_DIR — volume-путь (для legacy и файлов состояния)
export const DATA_DIR = path.join(PROJECT_ROOT, 'data');

// BANK_DIR — банки контента всегда читаем из data_defaults (свежий деплой из git).
// Если data_defaults не существует (локальная разработка) — fallback на data/.
const DATA_DEFAULTS_DIR = path.join(PROJECT_ROOT, 'data_defaults');
export const BANK_DIR = fs.existsSync(DATA_DEFAULTS_DIR) ? DATA_DEFAULTS_DIR : DATA_DIR;

/** Путь к файлу состояния/истории (на volume) */
export function dataFilePath(...segments) {
  return path.join(DATA_DIR, ...segments);
}

/** Путь к файлу банка контента (всегда свежий из git) */
export function bankFilePath(...segments) {
  return path.join(BANK_DIR, ...segments);
}
