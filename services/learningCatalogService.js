import fs from 'fs';
import LearningItem from '../models/LearningItem.js';
import { dataFilePath } from '../utils/projectPaths.js';

function readJsonArray(filename) {
  try {
    const raw = fs.readFileSync(dataFilePath(filename), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(`[LearningCatalog] Failed to read ${filename}:`, error.message);
    return [];
  }
}

function levelDifficulty(level = 'A1') {
  const map = { A1: 1, A2: 2, B1: 3, B2: 4 };
  return map[level] || 1;
}

function normalizeWordTranslation(entry) {
  if (typeof entry.translation === 'string' && entry.translation.trim()) {
    return entry.translation.trim();
  }
  if (Array.isArray(entry.translations)) {
    return entry.translations.find((item) => typeof item === 'string' && item.trim())?.trim() || '';
  }
  return '';
}

function mapEnglishWordItems() {
  return readJsonArray('word_bank.json')
    .filter((entry) => entry?.word && normalizeWordTranslation(entry))
    .map((entry) => ({
      language_code: 'en',
      source_type: 'word_bank',
      source_key: entry.word.trim().toLowerCase(),
      level: entry.level || 'A2',
      type: 'word',
      base_form: entry.word.trim(),
      text: entry.word.trim(),
      translation: normalizeWordTranslation(entry),
      example: entry.example || null,
      example_translation: null,
      topic: entry.topic || 'general',
      difficulty: levelDifficulty(entry.level),
      grammar_metadata: {
        partOfSpeech: entry.partOfSpeech || null,
      },
      tags: [entry.partOfSpeech, entry.topic].filter(Boolean),
      metadata: entry,
      is_active: true,
    }));
}

function mapEnglishIdiomItems() {
  return readJsonArray('idiom_bank.json')
    .filter((entry) => entry?.idiom && entry?.translation)
    .map((entry) => ({
      language_code: 'en',
      source_type: 'idiom_bank',
      source_key: entry.idiom.trim().toLowerCase(),
      level: entry.level || 'B1',
      type: 'expression',
      base_form: entry.idiom.trim(),
      text: entry.idiom.trim(),
      translation: entry.translation.trim(),
      example: entry.example || null,
      example_translation: null,
      topic: entry.topic || 'general',
      difficulty: levelDifficulty(entry.level || 'B1'),
      grammar_metadata: {
        meaning: entry.meaning || null,
        hint: entry.hint || null,
      },
      tags: ['idiom', entry.topic].filter(Boolean),
      metadata: entry,
      is_active: true,
    }));
}

function mapEnglishPhrasalVerbItems() {
  return readJsonArray('phrasal_verbs_bank.json')
    .filter((entry) => entry?.phrasalVerb && entry?.translation)
    .map((entry) => ({
      language_code: 'en',
      source_type: 'phrasal_verbs_bank',
      source_key: entry.phrasalVerb.trim().toLowerCase(),
      level: entry.level || 'B1',
      type: 'expression',
      base_form: entry.phrasalVerb.trim(),
      text: entry.phrasalVerb.trim(),
      translation: entry.translation.trim(),
      example: entry.example || null,
      example_translation: null,
      topic: entry.topic || 'general',
      difficulty: levelDifficulty(entry.level || 'B1'),
      grammar_metadata: {
        subtype: 'phrasal_verb',
        meaning: entry.meaning || null,
        hint: entry.hint || null,
      },
      tags: ['phrasal_verb', entry.topic].filter(Boolean),
      metadata: entry,
      is_active: true,
    }));
}

function mapLanguageSeedItems(filename, languageCode) {
  return readJsonArray(filename)
    .filter((entry) => entry?.text && entry?.translation)
    .map((entry) => ({
      language_code: languageCode,
      source_type: filename.replace('.json', ''),
      source_key: entry.sourceKey || entry.text.trim().toLowerCase(),
      level: entry.level || 'A1',
      type: entry.type || 'word',
      base_form: entry.base_form || entry.text.trim(),
      text: entry.text.trim(),
      translation: entry.translation.trim(),
      example: entry.example || null,
      example_translation: entry.example_translation || null,
      topic: entry.topic || 'general',
      difficulty: levelDifficulty(entry.level || 'A1'),
      grammar_metadata: entry.grammar_metadata || null,
      tags: entry.tags || [],
      metadata: entry,
      is_active: true,
    }));
}

export async function syncLearningCatalog() {
  const rows = [
    ...mapEnglishWordItems(),
    ...mapEnglishIdiomItems(),
    ...mapEnglishPhrasalVerbItems(),
    ...mapLanguageSeedItems('learning_items_it.json', 'it'),
    ...mapLanguageSeedItems('learning_items_de.json', 'de'),
  ];

  if (rows.length === 0) {
    return { upserted: 0 };
  }

  await LearningItem.bulkCreate(rows, {
    updateOnDuplicate: [
      'level',
      'type',
      'base_form',
      'text',
      'translation',
      'example',
      'example_translation',
      'topic',
      'difficulty',
      'grammar_metadata',
      'tags',
      'metadata',
      'is_active',
      'updated_at',
    ],
  });

  return { upserted: rows.length };
}
