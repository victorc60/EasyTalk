// init/initQueues.js
import fs from 'fs';
import ContentQueue from '../models/ContentQueue.js';
import { loadBankToQueue } from '../services/queueService.js';
import { bankFilePath } from '../utils/projectPaths.js';

const BANKS = [
  { type: 'word',    file: 'word_bank.json',           idKey: 'word'        },
  { type: 'quiz',    file: 'quiz_bank.json',            idKey: 'question'    },
  { type: 'idiom',   file: 'idiom_bank.json',           idKey: 'idiom'       },
  { type: 'phrasal', file: 'phrasal_verbs_bank.json',   idKey: 'phrasalVerb' },
  { type: 'fact',    file: 'facts_bank.json',           idKey: 'claim'       },
];

function readBankFile(filename) {
  const filePath = bankFilePath(filename);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.error(`[QUEUE] Ошибка чтения банка ${filename}:`, error.message);
    return null;
  }
}

/**
 * Инициализирует и синхронизирует очереди контента при старте бота.
 * - Если очередь пуста — загружает весь банк.
 * - Если очередь уже есть — добавляет только новые элементы из банка.
 */
export async function initAllQueues() {
  console.log('[QUEUE] Инициализация очередей контента...');

  for (const { type, file, idKey } of BANKS) {
    try {
      const bankData = readBankFile(file);
      if (!bankData || bankData.length === 0) {
        console.warn(`[QUEUE] Банк "${file}" пуст или недоступен, пропускаем тип "${type}"`);
        continue;
      }

      const existingCount = await ContentQueue.count({ where: { type } });

      if (existingCount === 0) {
        // Первый запуск — загружаем весь банк
        await loadBankToQueue(type, bankData);
        console.log(`[QUEUE] ✅ Очередь "${type}" загружена (${bankData.length} элементов)`);
        continue;
      }

      // Очередь уже есть — проверяем нет ли новых элементов в банке
      const existingRows = await ContentQueue.findAll({
        where: { type },
        attributes: ['content_id', 'content']
      });

      // Строим Set существующих натуральных ключей (сам контент, не position-based id)
      const existingKeys = new Set(
        existingRows.map(r => String(r.content?.[idKey] || r.content_id).trim().toLowerCase())
      );

      const newItems = bankData.filter(item => {
        const key = String(item[idKey] || '').trim().toLowerCase();
        return key && !existingKeys.has(key);
      });

      if (newItems.length === 0) {
        console.log(`[QUEUE] Очередь "${type}" актуальна (${existingCount} элементов)`);
        continue;
      }

      // Добавляем только новые элементы, передавая полный банк для корректной генерации вариантов
      await loadBankToQueue(type, bankData, existingKeys);
      console.log(`[QUEUE] ✅ Добавлено ${newItems.length} новых элементов в очередь "${type}" (было ${existingCount})`);
    } catch (error) {
      console.error(`[QUEUE] Ошибка инициализации очереди "${type}":`, error.message);
    }
  }

  console.log('[QUEUE] Инициализация очередей завершена');
}
