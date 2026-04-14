// services/queueService.js
import ContentQueue from '../models/ContentQueue.js';
import DailyLog from '../models/DailyLog.js';

const TZ = 'Europe/Chisinau';

function getTodayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

/**
 * Deterministically picks distractors from the bank for option generation.
 * Uses index-based stepping so the result is the same every time for the same item.
 */
function generateOptions(allItems, currentIndex, getTranslation) {
  const bankSize = allItems.length;
  const correctTranslation = getTranslation(allItems[currentIndex]);
  const distractors = [];
  let step = 1;

  while (distractors.length < 3 && step <= bankSize) {
    const idx = (currentIndex + step) % bankSize;
    const t = getTranslation(allItems[idx]);
    if (t && t !== correctTranslation && !distractors.includes(t)) {
      distractors.push(t);
    }
    step++;
  }

  // Place correct answer at position (currentIndex % 4) for variety
  const correctPos = currentIndex % 4;
  const options = [...distractors];
  options.splice(correctPos, 0, correctTranslation);

  return { options: options.slice(0, 4), correctIndex: correctPos };
}

/**
 * Загружает банк контента в таблицу content_queue строго по порядку.
 * Обогащает элементы question/options/correctIndex для типов без них.
 */
export async function loadBankToQueue(type, bankData) {
  try {
    console.log(`[QUEUE] Загружаем банк "${type}" в очередь (${bankData.length} элементов)...`);
    const records = [];

    for (let i = 0; i < bankData.length; i++) {
      const item = bankData[i];
      let contentId;
      let enriched = { ...item };

      switch (type) {
        case 'word': {
          contentId = item.id || `word_${i + 1}`;
          // Normalize translation to single string
          enriched.translation = Array.isArray(item.translations)
            ? item.translations[0]
            : (item.translation || '');
          const getWordTranslation = (it) =>
            Array.isArray(it.translations) ? it.translations[0] : (it.translation || '');
          const { options, correctIndex } = generateOptions(bankData, i, getWordTranslation);
          enriched.question = `What does "${item.word}" mean?`;
          enriched.options = options;
          enriched.correctIndex = correctIndex;
          break;
        }
        case 'idiom': {
          contentId = item.id || `idiom_${i + 1}`;
          enriched.id = contentId;
          const { options, correctIndex } = generateOptions(bankData, i, (it) => it.translation || '');
          enriched.question = `What does "${item.idiom}" mean?`;
          enriched.options = options;
          enriched.correctIndex = correctIndex;
          break;
        }
        case 'phrasal': {
          contentId = item.id || `phrasal_${i + 1}`;
          enriched.id = contentId;
          enriched.verb = item.phrasalVerb || item.verb || '';
          const { options, correctIndex } = generateOptions(bankData, i, (it) => it.translation || '');
          enriched.question = `What does "${enriched.verb}" mean?`;
          enriched.options = options;
          enriched.correctIndex = correctIndex;
          break;
        }
        case 'quiz': {
          contentId = item.id || `quiz_${i + 1}`;
          enriched.id = contentId;
          break;
        }
        case 'fact': {
          contentId = item.id || `fact_${i + 1}`;
          enriched.id = contentId;
          break;
        }
        default:
          contentId = `${type}_${i + 1}`;
      }

      records.push({
        type,
        content_id: contentId,
        content: enriched,
        used: false,
        used_at: null
      });
    }

    await ContentQueue.bulkCreate(records);
    console.log(`[QUEUE] ✅ Загружено ${records.length} элементов для типа "${type}"`);
    return records.length;
  } catch (error) {
    console.error(`[QUEUE] Ошибка загрузки банка "${type}":`, error.message);
    throw error;
  }
}

/**
 * Возвращает следующий неиспользованный элемент очереди с наименьшим id.
 * Перед поиском проверяет нужен ли сброс очереди.
 * @returns {{ item, queueId, contentId } | null}
 */
export async function getNextItem(type) {
  try {
    await resetQueueIfNeeded(type);

    const row = await ContentQueue.findOne({
      where: { type, used: false },
      order: [['id', 'ASC']]
    });

    if (!row) {
      console.log(`[QUEUE] Нет доступных элементов для типа "${type}"`);
      return null;
    }

    console.log(`[QUEUE] Следующий элемент для "${type}": id=${row.id}, content_id=${row.content_id}`);
    return { item: row.content, queueId: row.id, contentId: row.content_id };
  } catch (error) {
    console.error(`[QUEUE] Ошибка получения следующего элемента "${type}":`, error.message);
    return null;
  }
}

/**
 * Помечает элемент очереди как использованный.
 */
export async function markAsUsed(queueId) {
  try {
    await ContentQueue.update(
      { used: true, used_at: new Date() },
      { where: { id: queueId } }
    );
    console.log(`[QUEUE] Элемент id=${queueId} помечен как использованный`);
  } catch (error) {
    console.error(`[QUEUE] Ошибка пометки id=${queueId} как использованного:`, error.message);
  }
}

/**
 * Проверяет, была ли уже рассылка данного типа сегодня.
 */
export async function alreadySentToday(type) {
  try {
    const today = getTodayDate();
    const record = await DailyLog.findOne({ where: { type, date: today } });
    return Boolean(record);
  } catch (error) {
    console.error(`[QUEUE] Ошибка проверки daily_log для "${type}":`, error.message);
    return false;
  }
}

/**
 * Записывает факт рассылки в daily_log.
 */
export async function logDaily(type, contentId) {
  try {
    const today = getTodayDate();
    await DailyLog.create({ type, content_id: contentId, date: today });
    console.log(`[QUEUE] Записано в daily_log: ${type} / ${contentId} / ${today}`);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      console.log(`[QUEUE] daily_log уже содержит запись для "${type}" / ${getTodayDate()}`);
    } else {
      console.error(`[QUEUE] Ошибка записи в daily_log:`, error.message);
    }
  }
}

/**
 * Если все элементы очереди данного типа использованы — сбрасывает их обратно в used=false.
 * @returns {boolean} true если был выполнен сброс
 */
export async function resetQueueIfNeeded(type) {
  try {
    const totalCount = await ContentQueue.count({ where: { type } });
    if (totalCount === 0) return false;

    const unusedCount = await ContentQueue.count({ where: { type, used: false } });

    if (unusedCount === 0) {
      console.log(`[QUEUE] Все ${totalCount} элементов "${type}" использованы — сбрасываем очередь`);
      await ContentQueue.update(
        { used: false, used_at: null },
        { where: { type } }
      );
      console.log(`[QUEUE] Очередь "${type}" сброшена, цикл начинается заново`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`[QUEUE] Ошибка сброса очереди "${type}":`, error.message);
    return false;
  }
}
