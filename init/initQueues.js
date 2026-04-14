// init/initQueues.js
import fs from 'fs';
import { Op } from 'sequelize';
import ContentQueue from '../models/ContentQueue.js';
import { loadBankToQueue } from '../services/queueService.js';
import { dataFilePath } from '../utils/projectPaths.js';

const BANKS = [
  { type: 'word',    file: 'word_bank.json',           historyFile: 'word_history.json',           historyKey: 'word'        },
  { type: 'quiz',    file: 'quiz_bank.json',            historyFile: 'quiz_history.json',            historyKey: 'question'    },
  { type: 'idiom',   file: 'idiom_bank.json',           historyFile: 'idiom_history.json',           historyKey: 'idiom'       },
  { type: 'phrasal', file: 'phrasal_verbs_bank.json',   historyFile: 'phrasal_verbs_history.json',   historyKey: 'verb'        },
  { type: 'fact',    file: 'facts_bank.json',           historyFile: 'fact_history.json',            historyKey: 'claim'       },
];

function readJsonFile(filename) {
  const filePath = dataFilePath(filename);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.error(`[QUEUE] Ошибка чтения файла ${filename}:`, error.message);
    return null;
  }
}

/**
 * После загрузки очереди помечает уже использованные элементы как used=true,
 * сверяясь с историей старой системы (history-файлы).
 */
async function seedHistoryIntoQueue(type, historyFile, historyKey) {
  const history = readJsonFile(historyFile);
  if (!history || history.length === 0) return;

  // Нормализуем историю в Set для быстрого поиска
  const historySet = new Set(history.map(h => String(h).trim().toLowerCase()));

  // Загружаем все записи этого типа из очереди
  const allRows = await ContentQueue.findAll({
    where: { type },
    attributes: ['id', 'content']
  });

  const idsToMark = [];
  for (const row of allRows) {
    const keyValue = row.content?.[historyKey];
    if (keyValue && historySet.has(String(keyValue).trim().toLowerCase())) {
      idsToMark.push(row.id);
    }
  }

  if (idsToMark.length === 0) return;

  await ContentQueue.update(
    { used: true, used_at: new Date() },
    { where: { id: { [Op.in]: idsToMark } } }
  );

  console.log(`[QUEUE] Помечено как использованных (из истории) для "${type}": ${idsToMark.length} элементов`);
}

/**
 * Инициализирует очереди контента для всех типов при старте бота.
 * Если очередь уже заполнена — пропускает.
 * Новая очередь сразу сидируется из файлов истории старой системы.
 */
export async function initAllQueues() {
  console.log('[QUEUE] Инициализация очередей контента...');

  for (const { type, file, historyFile, historyKey } of BANKS) {
    try {
      const existingCount = await ContentQueue.count({ where: { type } });

      if (existingCount > 0) {
        console.log(`[QUEUE] Очередь "${type}" уже инициализирована (${existingCount} элементов), пропускаем`);
        continue;
      }

      const bankData = readJsonFile(file);
      if (!bankData || bankData.length === 0) {
        console.warn(`[QUEUE] Банк "${file}" пуст или недоступен, пропускаем тип "${type}"`);
        continue;
      }

      await loadBankToQueue(type, bankData);
      console.log(`[QUEUE] ✅ Очередь "${type}" загружена (${bankData.length} элементов)`);

      // Помечаем уже использованные элементы из истории старой системы
      await seedHistoryIntoQueue(type, historyFile, historyKey);
    } catch (error) {
      console.error(`[QUEUE] Ошибка инициализации очереди "${type}":`, error.message);
    }
  }

  console.log('[QUEUE] Инициализация очередей завершена');
}
