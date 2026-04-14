#!/usr/bin/env node
/**
 * Скрипт инициализации данных.
 * Копирует файлы банков из /app/data_defaults в /app/data если их там нет.
 * Запускается перед стартом бота при каждом деплое.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS_DIR = path.resolve(__dirname, '..', 'data_defaults');
const DATA_DIR = path.resolve(__dirname, '..', 'data');

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
  const src = path.join(DEFAULTS_DIR, file);
  const dest = path.join(DATA_DIR, file);

  let needsCopy = !fs.existsSync(dest);

  if (!needsCopy && file.endsWith('.json')) {
    try {
      const parsed = JSON.parse(fs.readFileSync(dest, 'utf8'));
      if (Array.isArray(parsed) && parsed.length === 0) {
        needsCopy = true;
        console.log(`⚠️ ${file} пустой, восстанавливаем из defaults`);
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
  console.log('✅ Все файлы данных на месте, копирование не требуется');
} else {
  console.log(`✅ Инициализация завершена: скопировано ${copied} файлов`);
}
