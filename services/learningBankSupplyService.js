import LearningItem from '../models/LearningItem.js';
import UserLearningItem from '../models/UserLearningItem.js';
import { normalizedContentText } from './bankContentRules.js';

export const LEARNING_BANK_SPECS = Object.fromEntries(['en', 'it', 'de'].map(languageCode => [
  `learning_${languageCode}`,
  { key: `learning_${languageCode}`, kind: 'catalog', languageCode, title: `Learning ${languageCode.toUpperCase()}` },
]));

const LEVELS = ['A1', 'A2', 'B1', 'B2'];

// A duplicate imported under a different source must not count as fresh stock.
export function summarizeLearningSupply(items, history) {
  const byId = new Map(items.map(item => [String(item.id), item]));
  const levels = LEVELS.map(level => {
    const available = new Set(items.filter(item => item.is_active && item.level === level)
      .map(item => normalizedContentText(item.text)));
    const seenByUser = new Map();
    for (const row of history) {
      const item = byId.get(String(row.learning_item_id));
      if (!item) continue;
      const key = normalizedContentText(item.text);
      if (!available.has(key)) continue;
      const user = String(row.user_id);
      if (!seenByUser.has(user)) seenByUser.set(user, new Set());
      seenByUser.get(user).add(key);
    }
    let mostSeen = 0;
    for (const seen of seenByUser.values()) mostSeen = Math.max(mostSeen, seen.size);
    return { level, total: available.size, remaining: available.size - mostSeen };
  });
  const lowest = [...levels].sort((a, b) => a.remaining - b.remaining)[0];
  return { existing: items, levels, level: lowest.level, remaining: lowest.remaining };
}

export async function getLearningBankSupply(spec) {
  const [items, history] = await Promise.all([
    LearningItem.findAll({
      where: { language_code: spec.languageCode },
      attributes: ['id', 'text', 'translation', 'example', 'example_translation', 'type', 'level', 'topic', 'is_active'],
      raw: true,
    }),
    UserLearningItem.findAll({
      where: { target_language: spec.languageCode },
      attributes: ['user_id', 'learning_item_id'], raw: true,
    }),
  ]);
  return summarizeLearningSupply(items, history);
}

export function learningItemRecord(languageCode, item, fingerprint) {
  return {
    language_code: languageCode, source_type: 'auto_catalog', source_key: fingerprint,
    level: item.level, type: item.type, base_form: item.text, text: item.text,
    translation: item.translation, example: item.example,
    example_translation: item.example_translation, topic: item.topic,
    difficulty: LEVELS.indexOf(item.level) + 1, metadata: item, is_active: true,
  };
}
