#!/usr/bin/env node
/**
 * Скрипт инициализации данных.
 * Копирует файлы банков из /app/data_defaults в /app/data если их там нет или банк уменьшился.
 * Файлы истории и стриков никогда не перезаписываются.
 * Запускается перед стартом бота при каждом деплое.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS_DIR = path.resolve(__dirname, '..', 'data_defaults');
const DATA_DIR = path.resolve(__dirname, '..', 'data');

// Эти файлы никогда не перезаписываем — там живые данные пользователей
const PROTECTED_FILES = new Set([
  'streaks.json',
  'word_history.json',
  'idiom_history.json',
  'phrasal_verbs_history.json',
  'quiz_history.json',
  'fact_history.json',
  'mini_event_history.json',
  'horoscope_history.json',
  'horoscope_cache.json',
]);

if (!fs.existsSync(DEFAULTS_DIR)) {
  console.log('ℹ️ data_defaults не найден, пропускаем инициализацию');
  process.exit(0);
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const files = fs.readdirSync(DEFAULTS_DIR);
let copied = 0;

for (const file of files) {
  if (PROTECTED_FILES.has(file)) {
    continue;
  }

  const src = path.join(DEFAULTS_DIR, file);
  const dest = path.join(DATA_DIR, file);

  let needsCopy = !fs.existsSync(dest);

  if (!needsCopy && file.endsWith('.json')) {
    try {
      const srcParsed = JSON.parse(fs.readFileSync(src, 'utf8'));
      const destParsed = JSON.parse(fs.readFileSync(dest, 'utf8'));
      if (Array.isArray(srcParsed) && Array.isArray(destParsed)) {
        if (destParsed.length < srcParsed.length) {
          needsCopy = true;
          console.log(`⚠️ ${file}: в банке ${destParsed.length} записей (по умолчанию ${srcParsed.length}), восстанавливаем`);
        }
      }
    } catch {
      needsCopy = true;
    }
  }

  if (needsCopy) {
    fs.copyFileSync(src, dest);
    console.log(`📋 Скопирован ${file} из defaults`);
    copied++;
  }
}

if (copied === 0) {
  console.log('✅ Все файлы банков в порядке, копирование не требуется');
} else {
  console.log(`✅ Инициализация завершена: восстановлено ${copied} файлов`);
}
