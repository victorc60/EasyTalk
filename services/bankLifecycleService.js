import fs from 'fs';
import path from 'path';
import { OpenAI } from 'openai';
import { CONFIG } from '../config.js';
import { sendAdminMessage } from '../utils/botUtils.js';
import { DATA_DIR } from '../utils/projectPaths.js';

const CANDIDATES_DIR = path.join(DATA_DIR, 'candidates');
const AUTOFILL_BATCH_SIZE = 30;
const AUDIT_TZ = 'Europe/Chisinau';

const BANK_SPECS = {
  word: {
    key: 'word',
    title: 'Word Bank',
    bankFile: path.join(DATA_DIR, 'word_bank.json'),
    bankSelector: (row) => row?.word,
    generatorSchema: {
      required: ['word', 'translation', 'level', 'partOfSpeech', 'topic']
    }
  },
  idiom: {
    key: 'idiom',
    title: 'Idiom Bank',
    bankFile: path.join(DATA_DIR, 'idiom_bank.json'),
    bankSelector: (row) => row?.idiom,
    generatorSchema: {
      required: ['idiom', 'translation', 'meaning', 'example', 'hint']
    }
  },
  phrasal_verb: {
    key: 'phrasal_verb',
    title: 'Phrasal Verb Bank',
    bankFile: path.join(DATA_DIR, 'phrasal_verbs_bank.json'),
    bankSelector: (row) => row?.phrasalVerb,
    generatorSchema: {
      required: ['phrasalVerb', 'translation', 'meaning', 'example', 'hint', 'topic']
    }
  },
  quiz: {
    key: 'quiz',
    title: 'Quiz Bank',
    bankFile: path.join(DATA_DIR, 'quiz_bank.json'),
    bankSelector: (row) => row?.question,
    generatorSchema: {
      required: ['question', 'options', 'correctIndex', 'hint', 'explanation']
    }
  },
  mini_event: {
    key: 'mini_event',
    title: 'Mini Event Bank',
    bankFile: path.join(DATA_DIR, 'mini_event_questions.json'),
    bankSelector: (row) => row?.id,
    generatorSchema: {
      required: ['id', 'type', 'question', 'options', 'correctIndex', 'explanation']
    }
  },
  fact: {
    key: 'fact',
    title: 'Fact Bank',
    bankFile: path.join(DATA_DIR, 'facts_bank.json'),
    bankSelector: (row) => row?.id,
    generatorSchema: {
      required: ['id', 'claim', 'claimRu', 'isTrue', 'explanation']
    }
  }
};

const OPENAI_MODEL = process.env.BANK_AUTOFILL_MODEL || CONFIG.GPT_MODEL || 'gpt-3.5-turbo';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function normalizeKey(value) {
  return (value || '').toString().trim().toLowerCase();
}

function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJsonArray(filePath, fallback = []) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    console.error(`Не удалось прочитать JSON массив ${filePath}:`, error.message);
    return fallback;
  }
}

function writeJsonArray(filePath, data) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function buildExistingKeySet(spec, bankRows) {
  const keys = new Set();
  for (const row of bankRows) {
    const key = normalizeKey(spec.bankSelector(row));
    if (key) {
      keys.add(key);
    }
  }
  return keys;
}

function getCoverageForBank(bankKey) {
  const spec = BANK_SPECS[bankKey];
  if (!spec) {
    throw new Error(`Неизвестный бан, который нужно заполнить: ${bankKey}`);
  }

  const bankRows = readJsonArray(spec.bankFile);
  const total = bankRows.length;
  const used = bankRows.filter(row => row.isUsed).length;
  const remaining = total - used;

  return {
    bankKey,
    title: spec.title,
    total,
    used,
    remaining,
    exhausted: remaining === 0,
    usageRate: total > 0 ? Math.round((used / total) * 100) : 0
  };
}

function extractJsonArrayFromText(text) {
  if (!text) return null;

  const cleaned = text
    .replace(/```json/gi, '```')
    .replace(/```JSON/gi, '```')
    .trim();

  if (cleaned.startsWith('```')) {
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      const payload = cleaned.slice(start, end + 1);
      try {
        const parsed = JSON.parse(payload);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
  }

  const arrayStart = cleaned.indexOf('[');
  const arrayEnd = cleaned.lastIndexOf(']');
  if (arrayStart === -1 || arrayEnd === -1 || arrayEnd <= arrayStart) {
    return null;
  }

  try {
    const parsed = JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildGenerationPrompt(bankKey, count, existingRows) {
  const recent = existingRows.slice(-20);

  if (bankKey === 'word') {
    return `Generate ${count} NEW unique English learning words for a Telegram daily game.
Return ONLY a JSON array. No markdown.
Schema per item:
{"word":"...","translation":"...","level":"A2|B1|B2|C1","partOfSpeech":"noun|verb|adjective|adverb","topic":"..."}
Rules:
- natural modern vocabulary
- no duplicates by word
- translation in Russian
- keep topic short
- avoid very rare academic words
Recent examples to avoid duplicates:\n${JSON.stringify(recent)}`;
  }

  if (bankKey === 'idiom') {
    return `Generate ${count} NEW unique English idioms for a Telegram daily game.
Return ONLY a JSON array. No markdown.
Schema:
{"idiom":"...","translation":"...","meaning":"...","example":"...","hint":"..."}
Rules:
- no duplicate idioms
- translation, meaning and hint in Russian
- example sentence in English
- B1-B2 friendly style
Recent examples to avoid duplicates:\n${JSON.stringify(recent)}`;
  }

  if (bankKey === 'phrasal_verb') {
    return `Generate ${count} NEW unique English phrasal verbs for a Telegram daily game.
Return ONLY a JSON array. No markdown.
Schema:
{"phrasalVerb":"...","translation":"...","meaning":"...","example":"...","hint":"...","topic":"..."}
Rules:
- no duplicate phrasal verbs
- translation, meaning, hint in Russian
- example in English
- topic should be one short word (work, travel, study, life etc.)
Recent examples to avoid duplicates:\n${JSON.stringify(recent)}`;
  }

  if (bankKey === 'quiz') {
    return `Generate ${count} NEW unique English learning multiple-choice questions for a Telegram quiz.
Return ONLY a JSON array. No markdown.
Schema:
{"question":"...","options":["...","...","...","..."],"correctIndex":0,"hint":"...","explanation":"..."}
Rules:
- 4 options exactly
- correctIndex is integer 0..3
- hint and explanation in Russian
- one clearly correct option
- level A2-B2
Recent examples to avoid duplicates:\n${JSON.stringify(recent)}`;
  }

  return `Generate ${count} NEW unique mini-event grammar questions for a Telegram quiz.
Return ONLY a JSON array. No markdown.
Schema:
{"id":"mini_ai_001","type":"grammar|translation|article|preposition|verb_form|modal|word_order","question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}
Rules:
- 4 options exactly
- correctIndex is integer 0..3
- id must be unique and start with mini_ai_
- explanation in English, concise
- no duplicates by id or question
Recent examples to avoid duplicates:\n${JSON.stringify(recent)}`;
}

function normalizeCandidateRow(bankKey, row, index, existingIdSet) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  if (bankKey === 'word') {
    const word = (row.word || '').toString().trim();
    const translation = (row.translation || '').toString().trim();
    if (!word || !translation) return null;
    return {
      word,
      translation,
      level: (row.level || 'B1').toString().trim() || 'B1',
      partOfSpeech: (row.partOfSpeech || 'noun').toString().trim() || 'noun',
      topic: (row.topic || 'general').toString().trim() || 'general'
    };
  }

  if (bankKey === 'idiom') {
    const idiom = (row.idiom || '').toString().trim();
    const translation = (row.translation || '').toString().trim();
    if (!idiom || !translation) return null;
    return {
      idiom,
      translation,
      meaning: (row.meaning || translation).toString().trim(),
      example: (row.example || '').toString().trim(),
      hint: (row.hint || '').toString().trim()
    };
  }

  if (bankKey === 'phrasal_verb') {
    const phrasalVerb = (row.phrasalVerb || '').toString().trim();
    const translation = (row.translation || '').toString().trim();
    if (!phrasalVerb || !translation) return null;
    return {
      phrasalVerb,
      translation,
      meaning: (row.meaning || translation).toString().trim(),
      example: (row.example || '').toString().trim(),
      hint: (row.hint || '').toString().trim(),
      topic: (row.topic || 'general').toString().trim() || 'general'
    };
  }

  if (bankKey === 'quiz') {
    const question = (row.question || '').toString().trim();
    const options = Array.isArray(row.options)
      ? row.options.map((x) => (x || '').toString().trim()).filter(Boolean)
      : [];
    const correctIndex = Number(row.correctIndex);
    if (!question || options.length !== 4 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      return null;
    }
    return {
      question,
      options,
      correctIndex,
      hint: (row.hint || '').toString().trim(),
      explanation: (row.explanation || '').toString().trim()
    };
  }

  const question = (row.question || '').toString().trim();
  const options = Array.isArray(row.options)
    ? row.options.map((x) => (x || '').toString().trim()).filter(Boolean)
    : [];
  const correctIndex = Number(row.correctIndex);
  if (!question || options.length !== 4 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    return null;
  }

  let id = (row.id || '').toString().trim();
  if (!id || existingIdSet.has(normalizeKey(id))) {
    id = `mini_ai_${Date.now()}_${index + 1}`;
  }

  return {
    id,
    type: (row.type || 'grammar').toString().trim() || 'grammar',
    question,
    options,
    correctIndex,
    explanation: (row.explanation || '').toString().trim() || 'Generated explanation.'
  };
}

async function generateCandidateRows(bankKey, count, existingRows) {
  const prompt = buildGenerationPrompt(bankKey, count, existingRows);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { choices } = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0.6,
        max_tokens: 4000,
        messages: [
          {
            role: 'system',
            content: 'You are a strict JSON generator. Return only valid JSON array without comments.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const content = choices?.[0]?.message?.content || '';
      const parsed = extractJsonArrayFromText(content);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.error(`Ошибка генерации банка ${bankKey}, попытка ${attempt}:`, error.message);
    }
  }

  return [];
}

function validateAndNormalizeCandidates(bankKey, candidates, existingRows) {
  const spec = BANK_SPECS[bankKey];
  const existingKeySet = buildExistingKeySet(spec, existingRows);
  const normalized = [];
  const addedKeys = new Set();
  const existingIdSet = new Set();

  if (bankKey === 'mini_event') {
    for (const row of existingRows) {
      const id = normalizeKey(row?.id);
      if (id) existingIdSet.add(id);
    }
  }

  for (let i = 0; i < candidates.length; i += 1) {
    const row = normalizeCandidateRow(bankKey, candidates[i], i, existingIdSet);
    if (!row) continue;

    const key = normalizeKey(spec.bankSelector(row));
    if (!key) continue;
    if (existingKeySet.has(key) || addedKeys.has(key)) continue;

    if (bankKey === 'mini_event') {
      existingIdSet.add(key);
    }

    normalized.push(row);
    addedKeys.add(key);
  }

  return normalized;
}

function candidateFilePath(bankKey) {
  ensureDirectory(CANDIDATES_DIR);
  return path.join(CANDIDATES_DIR, `${bankKey}_candidate.json`);
}

async function autofillBankIfExhausted(bankKey, count) {
  const spec = BANK_SPECS[bankKey];
  const coverage = getCoverageForBank(bankKey);

  if (!coverage.exhausted) {
    return {
      bankKey,
      generated: 0,
      merged: 0,
      skipped: true,
      reason: `remaining=${coverage.remaining}`
    };
  }

  const existingRows = readJsonArray(spec.bankFile);
  const rawCandidates = await generateCandidateRows(bankKey, count, existingRows);
  if (!rawCandidates.length) {
    return {
      bankKey,
      generated: 0,
      merged: 0,
      skipped: true,
      reason: 'generation_failed'
    };
  }

  const normalized = validateAndNormalizeCandidates(bankKey, rawCandidates, existingRows);
  writeJsonArray(candidateFilePath(bankKey), normalized);

  if (!normalized.length) {
    return {
      bankKey,
      generated: rawCandidates.length,
      merged: 0,
      skipped: true,
      reason: 'validation_failed'
    };
  }

  writeJsonArray(spec.bankFile, [...existingRows, ...normalized]);

  return {
    bankKey,
    generated: rawCandidates.length,
    merged: normalized.length,
    skipped: false,
    reason: 'merged'
  };
}

function moscowDateTime() {
  return new Date().toLocaleString('ru-RU', { timeZone: AUDIT_TZ });
}


export function getAllBankCoverage() {
  return Object.keys(BANK_SPECS).map((bankKey) => getCoverageForBank(bankKey));
}

export async function runDailyBankAuditAndAutofill(bot, options = {}) {
  const count = Number(options.batchSize) > 0 ? Number(options.batchSize) : AUTOFILL_BATCH_SIZE;
  const before = getAllBankCoverage();
  const actions = [];

  for (const row of before) {
    const result = await autofillBankIfExhausted(row.bankKey, count);
    actions.push(result);
  }

  const after = getAllBankCoverage();

  const lines = [];
  lines.push(`🧠 Bank audit ${moscowDateTime()} (${AUDIT_TZ})`);
  lines.push('');
  lines.push('Coverage:');

  for (const row of after) {
    lines.push(`• ${row.title}: ${row.used}/${row.total} (${row.usageRate}%), remaining=${row.remaining}`);
  }

  const changed = actions.filter((x) => !x.skipped);
  if (changed.length) {
    lines.push('');
    lines.push('Autofill:');
    for (const row of changed) {
      lines.push(`• ${BANK_SPECS[row.bankKey].title}: merged ${row.merged} (generated ${row.generated})`);
    }
  } else {
    lines.push('');
    lines.push('Autofill: не потребовался.');
  }

  const failed = actions.filter((x) => x.reason === 'generation_failed' || x.reason === 'validation_failed');
  if (failed.length) {
    lines.push('');
    lines.push('Warnings:');
    for (const row of failed) {
      lines.push(`• ${BANK_SPECS[row.bankKey].title}: ${row.reason}`);
    }
  }

  if (bot) {
    await sendAdminMessage(bot, lines.join('\n'));
  }

  return {
    before,
    after,
    actions
  };
}

export { BANK_SPECS, AUTOFILL_BATCH_SIZE };
