// init/initQueues.js
import fs from 'fs';
import { Op } from 'sequelize';
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
 * Удаляет из очереди элементы, которых больше нет в текущем банке.
 * Это чистит устаревший/мусорный контент после обновления банков.
 */
async function removeStaleItems(type, bankKeys) {
  const allRows = await ContentQueue.findAll({
    where: { type },
    attributes: ['id', 'content']
  });

  const staleIds = [];
  for (const row of allRows) {
    // Получаем натуральный ключ из контента
    const key = String(
      row.content?.word || row.content?.idiom || row.content?.phrasalVerb ||
      row.content?.question || row.content?.claim || ''
    ).trim().toLowerCase();

    if (!key || !bankKeys.has(key)) {
      staleIds.push(row.id);
    }
  }

  if (staleIds.length === 0) return 0;

  await ContentQueue.destroy({ where: { id: { [Op.in]: staleIds } } });
  console.log(`[QUEUE] 🧹 Удалено ${staleIds.length} устаревших элементов из очереди "${type}"`);
  return staleIds.length;
}

/**
 * Инициализирует и синхронизирует очереди контента при старте бота.
 * - Если очередь пуста — загружает весь банк.
 * - Если очередь уже есть — удаляет устаревшие и добавляет новые элементы.
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

      // Строим Set актуальных ключей из текущего банка
      const bankKeys = new Set(
        bankData.map(item => String(item[idKey] || '').trim().toLowerCase()).filter(Boolean)
      );

      const existingCount = await ContentQueue.count({ where: { type } });

      if (existingCount === 0) {
        // Первый запуск — загружаем весь банк
        await loadBankToQueue(type, bankData);
        console.log(`[QUEUE] ✅ Очередь "${type}" загружена (${bankData.length} элементов)`);
        continue;
      }

      // Удаляем устаревшие элементы (которых нет в текущем банке)
      await removeStaleItems(type, bankKeys);

      // Проверяем наличие новых элементов
      const existingRows = await ContentQueue.findAll({
        where: { type },
        attributes: ['content_id', 'content']
      });

      const existingKeys = new Set(
        existingRows.map(r => String(r.content?.[idKey] || r.content_id).trim().toLowerCase())
      );

      const hasNew = bankData.some(item => {
        const key = String(item[idKey] || '').trim().toLowerCase();
        return key && !existingKeys.has(key);
      });

      if (!hasNew) {
        const count = await ContentQueue.count({ where: { type } });
        console.log(`[QUEUE] Очередь "${type}" актуальна (${count} элементов)`);
        continue;
      }

      await loadBankToQueue(type, bankData, existingKeys);
      const newCount = await ContentQueue.count({ where: { type } });
      console.log(`[QUEUE] ✅ Очередь "${type}" синхронизирована (${newCount} элементов)`);

    } catch (error) {
      console.error(`[QUEUE] Ошибка инициализации очереди "${type}":`, error.message);
    }
  }

  console.log('[QUEUE] Инициализация очередей завершена');
}
