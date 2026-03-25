// content/contentGenerators.js
import { OpenAI } from 'openai';
import { CONFIG } from '../config.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const usedFactsCache = new Set();
const CACHE_LIMIT = 200; // Increased to store more facts and reduce repetition

async function generateEnglishContent(prompt, format = 'text') {
  try {
    const { choices } = await openai.chat.completions.create({
      model: CONFIG.GPT_MODEL,
      messages: [{ role: 'system', content: prompt }],
      temperature: 0.8,
      max_tokens: CONFIG.OPENAI_MAX_TOKENS
    });

    const content = choices[0]?.message?.content;
    if (!content) {
      console.error('OpenAI вернул пустой ответ для prompt:', prompt);
      return null;
    }

    if (format === 'json') {
      try {
        const parsed = JSON.parse(content);
        if (!parsed || typeof parsed !== 'object') {
          console.error('OpenAI вернул некорректный JSON:', content);
          return null;
        }
        return parsed;
      } catch (error) {
        console.error('Ошибка парсинга JSON от OpenAI:', error.message, 'Content:', content);
        return null;
      }
    }
    return content;
  } catch (error) {
    console.error('Ошибка генерации контента:', error.message);
    return null;
  }
}

export async function dailyFact() {
  loadCuratedFactsBank();
  const factEntry = pickCuratedFact();
  if (!factEntry) {
    console.warn('⚠️ Fact of the Day не может быть сформирован: facts_bank.json пуст или недоступен');
    return null;
  }

  return {
    id: factEntry.id,
    claim: factEntry.claim,
    claimRu: factEntry.claimRu,
    isTrue: factEntry.isTrue,
    explanation: factEntry.explanation
  };
}

// Добавляем в начало файла
const usedWordsCache = new Set();
const MAX_CACHE_SIZE = 365; // Храним 365 последних слов (около года)
const WORD_HISTORY_FILE = path.resolve(process.cwd(), 'data/word_history.json');
const WORD_BANK_FILE = path.resolve(process.cwd(), 'data/word_bank.json');
const FACTS_BANK_FILE = path.resolve(process.cwd(), 'data/facts_bank.json');
let curatedWordBank = [];
let curatedFactsBank = [];
let availableCuratedWords = [];
const usedIdiomsCache = new Set();
const IDIOM_HISTORY_FILE = path.resolve(process.cwd(), 'data/idiom_history.json');
const IDIOM_BANK_FILE = path.resolve(process.cwd(), 'data/idiom_bank.json');
let curatedIdiomBank = [];
let availableCuratedIdioms = [];
const usedPhrasalVerbsCache = new Set();
const PHRASAL_VERBS_HISTORY_FILE = path.resolve(process.cwd(), 'data/phrasal_verbs_history.json');
const PHRASAL_VERBS_BANK_FILE = path.resolve(process.cwd(), 'data/phrasal_verbs_bank.json');
let curatedPhrasalVerbsBank = [];
let availableCuratedPhrasalVerbs = [];
const usedQuizCache = new Set();
const QUIZ_HISTORY_FILE = path.resolve(process.cwd(), 'data/quiz_history.json');
const QUIZ_BANK_FILE = path.resolve(process.cwd(), 'data/quiz_bank.json');
const FACT_HISTORY_FILE = path.resolve(process.cwd(), 'data/fact_history.json');
let curatedQuizBank = [];

function loadUsedWordsFromDisk() {
  try {
    if (fs.existsSync(WORD_HISTORY_FILE)) {
      const raw = fs.readFileSync(WORD_HISTORY_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const word of parsed) {
          if (typeof word === 'string' && word.trim()) {
            usedWordsCache.add(word.trim().toLowerCase());
          }
        }
        console.log(`📚 Загружено ${usedWordsCache.size} слов из истории`);
      }
    } else {
      console.log('📚 Файл истории слов не найден, создаём новый');
    }
  } catch (error) {
    console.error('Не удалось загрузить историю слов:', error.message);
  }
}

function saveUsedWordsToDisk() {
  try {
    const dir = path.dirname(WORD_HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Сохраняем не более MAX_CACHE_SIZE последних слов
    const wordsArray = Array.from(usedWordsCache);
    const trimmed = wordsArray.slice(Math.max(0, wordsArray.length - MAX_CACHE_SIZE));
    fs.writeFileSync(WORD_HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    console.log(`💾 Сохранено ${trimmed.length} слов в историю`);
  } catch (error) {
    console.error('Не удалось сохранить историю слов:', error.message);
  }
}

function loadUsedIdiomsFromDisk() {
  try {
    if (fs.existsSync(IDIOM_HISTORY_FILE)) {
      const raw = fs.readFileSync(IDIOM_HISTORY_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const idiom of parsed) {
          if (typeof idiom === 'string' && idiom.trim()) {
            usedIdiomsCache.add(idiom.trim().toLowerCase());
          }
        }
        console.log(`📒 Загружено ${usedIdiomsCache.size} идиом из истории`);
      }
    } else {
      console.log('📒 Файл истории идиом не найден, создаём новый');
    }
  } catch (error) {
    console.error('Не удалось загрузить историю идиом:', error.message);
  }
}

function saveUsedIdiomsToDisk() {
  try {
    const dir = path.dirname(IDIOM_HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const idiomsArray = Array.from(usedIdiomsCache);
    const trimmed = idiomsArray.slice(Math.max(0, idiomsArray.length - MAX_CACHE_SIZE));
    fs.writeFileSync(IDIOM_HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    console.log(`💾 Сохранено ${trimmed.length} идиом в историю`);
  } catch (error) {
    console.error('Не удалось сохранить историю идиом:', error.message);
  }
}

// Функции для работы с Phrasal Verbs
function loadUsedPhrasalVerbsFromDisk() {
  try {
    if (fs.existsSync(PHRASAL_VERBS_HISTORY_FILE)) {
      const raw = fs.readFileSync(PHRASAL_VERBS_HISTORY_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const phrasalVerb of parsed) {
          if (typeof phrasalVerb === 'string' && phrasalVerb.trim()) {
            usedPhrasalVerbsCache.add(phrasalVerb.trim().toLowerCase());
          }
        }
        console.log(`📒 Загружено ${usedPhrasalVerbsCache.size} phrasal verbs из истории`);
      }
    } else {
      console.log('📒 Файл истории phrasal verbs не найден, создаём новый');
    }
  } catch (error) {
    console.error('Не удалось загрузить историю phrasal verbs:', error.message);
  }
}

function saveUsedPhrasalVerbsToDisk() {
  try {
    const dir = path.dirname(PHRASAL_VERBS_HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const phrasalVerbsArray = Array.from(usedPhrasalVerbsCache);
    const trimmed = phrasalVerbsArray.slice(Math.max(0, phrasalVerbsArray.length - MAX_CACHE_SIZE));
    fs.writeFileSync(PHRASAL_VERBS_HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    console.log(`💾 Сохранено ${trimmed.length} phrasal verbs в историю`);
  } catch (error) {
    console.error('Не удалось сохранить историю phrasal verbs:', error.message);
  }
}

function loadUsedQuizFromDisk() {
  try {
    if (fs.existsSync(QUIZ_HISTORY_FILE)) {
      const raw = fs.readFileSync(QUIZ_HISTORY_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (typeof entry === 'string' && entry.trim()) {
            usedQuizCache.add(entry.trim().toLowerCase());
          }
        }
        console.log(`📒 Загружено ${usedQuizCache.size} quiz вопросов из истории`);
      }
    } else {
      console.log('📒 Файл истории квиза не найден, создаём новый');
    }
  } catch (error) {
    console.error('Не удалось загрузить историю квиза:', error.message);
  }
}

function saveUsedQuizToDisk() {
  try {
    const dir = path.dirname(QUIZ_HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const quizArray = Array.from(usedQuizCache);
    const trimmed = quizArray.slice(Math.max(0, quizArray.length - MAX_CACHE_SIZE));
    fs.writeFileSync(QUIZ_HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    console.log(`💾 Сохранено ${trimmed.length} quiz вопросов в историю`);
  } catch (error) {
    console.error('Не удалось сохранить историю квиза:', error.message);
  }
}

function loadUsedFactsFromDisk() {
  try {
    if (fs.existsSync(FACT_HISTORY_FILE)) {
      const raw = fs.readFileSync(FACT_HISTORY_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const factKey of parsed) {
          if (typeof factKey === 'string' && factKey.trim()) {
            usedFactsCache.add(factKey.trim());
          }
        }
        console.log(`📒 Загружено ${usedFactsCache.size} ключей фактов из истории`);
      }
    } else {
      console.log('📒 Файл истории фактов не найден, создаём новый');
    }
  } catch (error) {
    console.error('Не удалось загрузить историю фактов:', error.message);
  }
}

function saveUsedFactsToDisk() {
  try {
    const dir = path.dirname(FACT_HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const factKeys = Array.from(usedFactsCache);
    const trimmed = factKeys.slice(Math.max(0, factKeys.length - CACHE_LIMIT));
    fs.writeFileSync(FACT_HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    console.log(`💾 Сохранено ${trimmed.length} ключей фактов в историю`);
  } catch (error) {
    console.error('Не удалось сохранить историю фактов:', error.message);
  }
}

function loadCuratedFactsBank() {
  try {
    if (!fs.existsSync(FACTS_BANK_FILE)) {
      console.warn('📘 Файл фактов не найден');
      curatedFactsBank = [];
      return curatedFactsBank;
    }
    const raw = fs.readFileSync(FACTS_BANK_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('формат facts bank должен быть массивом');
    }
    const seen = new Set();
    curatedFactsBank = parsed
      .filter((entry) =>
        entry &&
        typeof entry.id === 'string' &&
        entry.id.trim() &&
        typeof entry.claim === 'string' &&
        entry.claim.trim() &&
        typeof entry.claimRu === 'string' &&
        entry.claimRu.trim() &&
        typeof entry.isTrue === 'boolean' &&
        typeof entry.explanation === 'string' &&
        entry.explanation.trim()
      )
      .map((entry) => ({
        id: entry.id.trim(),
        claim: entry.claim.trim(),
        claimRu: entry.claimRu.trim(),
        isTrue: entry.isTrue,
        explanation: entry.explanation.trim()
      }))
      .filter((entry) => {
        const key = entry.id.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    console.log(`📘 Загружено ${curatedFactsBank.length} фактов из банка`);
  } catch (error) {
    console.error('Не удалось загрузить банк фактов:', error.message);
    curatedFactsBank = [];
  }
  return curatedFactsBank;
}

function loadCuratedWordBank() {
  try {
    if (!fs.existsSync(WORD_BANK_FILE)) {
      console.warn('📘 Файл словаря не найден, продолжим с резервными словами');
      curatedWordBank = [];
      return curatedWordBank;
    }
    const raw = fs.readFileSync(WORD_BANK_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('формат словаря должен быть массивом');
    }
    curatedWordBank = parsed
      .filter((entry) => {
        if (!entry?.word) return false;
        // Поддерживаем оба формата:
        // - legacy: { translation: "..." }
        // - current bank: { translations: ["...", "..."] }
        if (typeof entry.translation === 'string' && entry.translation.trim()) return true;
        if (Array.isArray(entry.translations) && entry.translations.some((t) => typeof t === 'string' && t.trim()))
          return true;
        return false;
      })
      .map((entry) => {
        const fromSingle = typeof entry.translation === 'string' ? entry.translation.trim() : '';
        const fromList = Array.isArray(entry.translations)
          ? entry.translations.map((t) => (t || '').toString().trim()).filter(Boolean)[0] || ''
          : '';
        const translation = fromSingle || fromList;

        return {
          word: entry.word.trim(),
          translation,
          level: entry.level || 'B1',
          partOfSpeech: entry.partOfSpeech || 'noun',
          topic: entry.topic || 'general',
          example: entry.example || '',
        };
      })
      .filter((entry) => entry.word && entry.translation);
    console.log(`📘 Загружено ${curatedWordBank.length} слов из словаря`);
  } catch (error) {
    console.error('Не удалось загрузить словарь слов:', error.message);
    curatedWordBank = [];
  }
  return curatedWordBank;
}

function loadCuratedIdiomBank() {
  try {
    if (!fs.existsSync(IDIOM_BANK_FILE)) {
      console.warn('📘 Файл идиом не найден, продолжим с резервными идиомами');
      curatedIdiomBank = [];
      return curatedIdiomBank;
    }
    const raw = fs.readFileSync(IDIOM_BANK_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('формат идиом должен быть массивом');
    }
    const seen = new Set();
    curatedIdiomBank = parsed
      .filter(entry => entry?.idiom && entry?.translation)
      .map(entry => ({
        idiom: entry.idiom.trim(),
        translation: entry.translation.trim(),
        meaning: entry.meaning || entry.translation.trim(),
        example: entry.example || '',
        hint: entry.hint || '',
        topic: entry.topic || ''
      }))
      .filter(entry => {
        const key = entry.idiom.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    console.log(`📘 Загружено ${curatedIdiomBank.length} идиом из словаря (уникальные)`);
  } catch (error) {
    console.error('Не удалось загрузить идиомы:', error.message);
    curatedIdiomBank = [];
  }
  return curatedIdiomBank;
}

function loadCuratedPhrasalVerbsBank() {
  try {
    if (!fs.existsSync(PHRASAL_VERBS_BANK_FILE)) {
      console.warn('📘 Файл phrasal verbs не найден, продолжим с резервными');
      curatedPhrasalVerbsBank = [];
      return curatedPhrasalVerbsBank;
    }
    const raw = fs.readFileSync(PHRASAL_VERBS_BANK_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('формат phrasal verbs должен быть массивом');
    }
    const seen = new Set();
    curatedPhrasalVerbsBank = parsed
      .filter(entry => entry?.phrasalVerb && entry?.translation)
      .map(entry => ({
        phrasalVerb: entry.phrasalVerb.trim(),
        translation: entry.translation.trim(),
        meaning: entry.meaning || entry.translation.trim(),
        example: entry.example || '',
        hint: entry.hint || '',
        topic: entry.topic || ''
      }))
      .filter(entry => {
        const key = entry.phrasalVerb.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    console.log(`📘 Загружено ${curatedPhrasalVerbsBank.length} phrasal verbs из словаря (уникальные)`);
  } catch (error) {
    console.error('Не удалось загрузить phrasal verbs:', error.message);
    curatedPhrasalVerbsBank = [];
  }
  return curatedPhrasalVerbsBank;
}

function loadCuratedQuizBank() {
  try {
    if (!fs.existsSync(QUIZ_BANK_FILE)) {
      console.warn('📘 Файл вопросов квиза не найден, продолжим с резервными');
      curatedQuizBank = [];
      return curatedQuizBank;
    }
    const raw = fs.readFileSync(QUIZ_BANK_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('формат квиза должен быть массивом');
    }
    curatedQuizBank = parsed
      .filter(entry => entry?.question && Array.isArray(entry?.options) && typeof entry?.correctIndex === 'number')
      .map(entry => ({
        question: entry.question.trim(),
        options: entry.options.map(opt => (opt || '').toString().trim()).filter(Boolean),
        correctIndex: Math.max(0, Math.min(entry.correctIndex, (entry.options?.length || 1) - 1)),
        explanation: entry.explanation || '',
        hint: entry.hint || '',
        topic: entry.topic || 'general'
      }))
      .filter(entry => entry.options.length >= 2);
    console.log(`📘 Загружено ${curatedQuizBank.length} вопросов квиза`);
  } catch (error) {
    console.error('Не удалось загрузить банк квиза:', error.message);
    curatedQuizBank = [];
  }
  return curatedQuizBank;
}

function getCuratedQuizBank() {
  if (!curatedQuizBank.length) {
    return loadCuratedQuizBank();
  }
  return curatedQuizBank;
}

function getCuratedIdiomBank() {
  if (!curatedIdiomBank.length) {
    return loadCuratedIdiomBank();
  }
  return curatedIdiomBank;
}

function getCuratedPhrasalVerbsBank() {
  if (!curatedPhrasalVerbsBank.length) {
    return loadCuratedPhrasalVerbsBank();
  }
  return curatedPhrasalVerbsBank;
}

function getCuratedFactsBank() {
  if (!curatedFactsBank.length) {
    return loadCuratedFactsBank();
  }
  return curatedFactsBank;
}

function getCuratedWordBank() {
  if (!curatedWordBank.length) {
    return loadCuratedWordBank();
  }
  return curatedWordBank;
}

export function isWordPresentInBank(word) {
  if (!word) {
    return false;
  }

  const bank = loadCuratedWordBank();
  const normalized = word.trim().toLowerCase();
  return bank.some((entry) => entry.word.trim().toLowerCase() === normalized);
}

// Инициализируем кэш слов из файла при загрузке модуля
loadUsedWordsFromDisk();
loadCuratedWordBank();
rebuildCuratedWordPool();
loadUsedIdiomsFromDisk();
loadCuratedIdiomBank();
rebuildCuratedIdiomPool();
loadUsedPhrasalVerbsFromDisk();
loadCuratedPhrasalVerbsBank();
rebuildCuratedPhrasalVerbsPool();
loadUsedQuizFromDisk();
loadCuratedQuizBank();
loadUsedFactsFromDisk();
loadCuratedFactsBank();

// Функция для ручного добавления слова в использованные (для исправления повторов)
export function addWordToUsedHistory(word) {
  const wordLower = word.trim().toLowerCase();
  usedWordsCache.add(wordLower);
  removeWordFromCuratedPool(wordLower);
  saveUsedWordsToDisk();
  console.log(`🔧 Добавлено слово "${word}" в историю использованных слов`);
}

export async function wordOfTheDay() {
  loadCuratedWordBank();
  const wordEntry = pickCuratedWord();
  
  if (!wordEntry) {
    console.warn('⚠️ Word of the Day не может быть сформирован: word_bank.json пуст или недоступен');
    return null;
  }

  const { options, correctIndex } = buildAnswerOptions(wordEntry);

  return {
    word: wordEntry.word,
    translation: wordEntry.translation,
    level: wordEntry.level,
    topic: wordEntry.topic,
    options,
    correctIndex,
    example: buildExampleSentence(wordEntry),
    fact: buildFactLine(wordEntry),
    mistakes: buildMistakeLine(wordEntry)
  };
}

// Функция для перемешивания массива
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function rebuildCuratedWordPool() {
  if (!curatedWordBank.length) {
    loadCuratedWordBank();
  }
  if (!curatedWordBank.length) {
    availableCuratedWords = [];
    return;
  }

  const unused = [];
  for (const entry of curatedWordBank) {
    const normalized = entry.word.trim().toLowerCase();
    if (!usedWordsCache.has(normalized)) {
      unused.push(entry);
    }
  }

  const poolSource = unused.length ? unused : curatedWordBank;
  availableCuratedWords = shuffleArray([...poolSource]);
}

function rebuildCuratedIdiomPool() {
  if (!curatedIdiomBank.length) {
    loadCuratedIdiomBank();
  }
  if (!curatedIdiomBank.length) {
    availableCuratedIdioms = [];
    return;
  }

  const unused = [];
  for (const entry of curatedIdiomBank) {
    const normalized = entry.idiom.trim().toLowerCase();
    if (!usedIdiomsCache.has(normalized)) {
      unused.push(entry);
    }
  }

  const poolSource = unused.length ? unused : curatedIdiomBank;
  availableCuratedIdioms = shuffleArray([...poolSource]);
}

function rebuildCuratedPhrasalVerbsPool() {
  if (!curatedPhrasalVerbsBank.length) {
    loadCuratedPhrasalVerbsBank();
  }
  if (!curatedPhrasalVerbsBank.length) {
    availableCuratedPhrasalVerbs = [];
    return;
  }

  const unused = [];
  for (const entry of curatedPhrasalVerbsBank) {
    const normalized = entry.phrasalVerb.trim().toLowerCase();
    if (!usedPhrasalVerbsCache.has(normalized)) {
      unused.push(entry);
    }
  }

  const poolSource = unused.length ? unused : curatedPhrasalVerbsBank;
  availableCuratedPhrasalVerbs = shuffleArray([...poolSource]);
}

export function getPhrasalVerbUsageStats() {
  const bank = getCuratedPhrasalVerbsBank();
  const total = bank.length;
  let usedFromBank = 0;

  for (const entry of bank) {
    const key = entry.phrasalVerb.trim().toLowerCase();
    if (usedPhrasalVerbsCache.has(key)) {
      usedFromBank += 1;
    }
  }

  const remaining = Math.max(total - usedFromBank, 0);

  return {
    total,
    used: usedFromBank,
    remaining,
    nextWillRepeat: total > 0 && remaining === 0,
    usageRate: total > 0 ? Math.round((usedFromBank / total) * 100) : 0
  };
}

function removeWordFromCuratedPool(wordLower) {
  if (!availableCuratedWords.length) {
    return;
  }
  availableCuratedWords = availableCuratedWords.filter(
    (entry) => entry.word.trim().toLowerCase() !== wordLower
  );
}

function pickCuratedWord() {
  if (!availableCuratedWords.length) {
    rebuildCuratedWordPool();
  }

  const entry = availableCuratedWords.pop();
  if (!entry) {
    return null;
  }

  const normalizedWord = entry.word.trim().toLowerCase();
  usedWordsCache.add(normalizedWord);
  if (usedWordsCache.size > MAX_CACHE_SIZE) {
    const oldest = usedWordsCache.values().next().value;
    usedWordsCache.delete(oldest);
  }
  saveUsedWordsToDisk();

  return entry;
}

function pickCuratedIdiom() {
  if (!availableCuratedIdioms.length) {
    rebuildCuratedIdiomPool();
  }

  const entry = availableCuratedIdioms.pop();
  if (!entry) return null;

  const normalized = entry.idiom.trim().toLowerCase();
  usedIdiomsCache.add(normalized);
  if (usedIdiomsCache.size > MAX_CACHE_SIZE) {
    const oldest = usedIdiomsCache.values().next().value;
    usedIdiomsCache.delete(oldest);
  }
  saveUsedIdiomsToDisk();

  return entry;
}

function pickCuratedPhrasalVerb() {
  if (!availableCuratedPhrasalVerbs.length) {
    rebuildCuratedPhrasalVerbsPool();
  }

  const entry = availableCuratedPhrasalVerbs.pop();
  if (!entry) return null;

  const normalized = entry.phrasalVerb.trim().toLowerCase();
  usedPhrasalVerbsCache.add(normalized);
  if (usedPhrasalVerbsCache.size > MAX_CACHE_SIZE) {
    const oldest = usedPhrasalVerbsCache.values().next().value;
    usedPhrasalVerbsCache.delete(oldest);
  }
  saveUsedPhrasalVerbsToDisk();

  return entry;
}

function pickQuizQuestion() {
  const bank = getCuratedQuizBank();
  if (!bank.length) return null;

  const unused = [];
  for (const entry of bank) {
    const key = entry.question.trim().toLowerCase();
    if (!usedQuizCache.has(key)) {
      unused.push(entry);
    }
  }

  const poolSource = unused.length ? unused : bank;
  const entry = shuffleArray([...poolSource]).pop();
  if (!entry) return null;

  const normalized = entry.question.trim().toLowerCase();
  usedQuizCache.add(normalized);
  if (usedQuizCache.size > MAX_CACHE_SIZE) {
    const oldest = usedQuizCache.values().next().value;
    usedQuizCache.delete(oldest);
  }
  saveUsedQuizToDisk();

  return entry;
}

function pickCuratedFact() {
  const bank = getCuratedFactsBank();
  if (!bank.length) return null;

  const unused = bank.filter((entry) => !usedFactsCache.has(entry.id));
  const poolSource = unused.length ? unused : bank;
  const entry = shuffleArray([...poolSource]).pop();
  if (!entry) return null;

  usedFactsCache.add(entry.id);
  if (usedFactsCache.size > CACHE_LIMIT) {
    const oldest = usedFactsCache.values().next().value;
    usedFactsCache.delete(oldest);
  }
  saveUsedFactsToDisk();

  return entry;
}

function buildAnswerOptions(entry) {
  const bank = getCuratedWordBank();
  const correct = entry.translation.trim();
  const lowerCorrect = correct.toLowerCase();
  const seen = new Set([lowerCorrect]);
  const pool = shuffleArray(
    bank
      .filter(item => item.translation && item.word !== entry.word)
      .map(item => item.translation.trim())
  );
  const uniqueOptions = [correct];

  for (const option of pool) {
    const key = option.toLowerCase();
    if (seen.has(key)) continue;
    uniqueOptions.push(option);
    seen.add(key);
    if (uniqueOptions.length === 4) break;
  }

  const shuffled = shuffleArray(uniqueOptions);
  let correctIndex = shuffled.findIndex(option => option.toLowerCase() === lowerCorrect);
  if (correctIndex === -1) {
    shuffled[0] = correct;
    correctIndex = 0;
  }

  return { options: shuffled, correctIndex };
}

function buildExampleSentence(entry) {
  if (entry?.example && String(entry.example).trim()) {
    return String(entry.example).trim();
  }
  const topic = (entry.topic || 'daily life').toLowerCase();
  const partOfSpeech = (entry.partOfSpeech || 'noun').toLowerCase();
  const word = entry.word;

  switch (partOfSpeech) {
    case 'verb':
      return `I try to ${word} whenever I deal with ${topic} tasks.`;
    case 'adjective':
      return `The word "${word}" helps describe ${topic} situations.`;
    case 'adverb':
      return `She spoke ${word} about the ${topic} plan.`;
    case 'determiner':
      return `Choose ${word} when the ${topic} choice is unclear.`;
    default:
      return `This ${word} often matters when people talk about ${topic}.`;
  }
}

function buildFactLine(entry) {
  const level = entry.level || 'B1';
  const topic = entry.topic || 'daily life';
  return `"${entry.word}" is a ${level} ${entry.partOfSpeech || 'word'} you can use when discussing ${topic}.`;
}

function buildMistakeLine(entry) {
  const partOfSpeech = entry.partOfSpeech || 'word';
  return `Don't confuse "${entry.word}" with other ${partOfSpeech}s — it means "${entry.translation}".`;
}

export async function idiomOfTheDay() {
  loadCuratedIdiomBank();
  const idiomEntry = pickCuratedIdiom();

  if (!idiomEntry) {
    console.warn('⚠️ Idiom of the Day не может быть сформирован: idiom_bank.json пуст или недоступен');
    return null;
  }

  const { options, correctIndex } = buildIdiomOptions(idiomEntry);

  return {
    idiom: idiomEntry.idiom,
    translation: idiomEntry.translation,
    meaning: idiomEntry.meaning || idiomEntry.translation,
    example: idiomEntry.example,
    hint: idiomEntry.hint,
    options,
    correctIndex
  };
}

function buildPhrasalVerbOptions(entry) {
  const bank = getCuratedPhrasalVerbsBank();
  const correct = entry.translation.trim();
  const lowerCorrect = correct.toLowerCase();
  const seen = new Set([lowerCorrect]);
  const pool = shuffleArray(
    bank
      .filter(item => item.translation && item.phrasalVerb !== entry.phrasalVerb)
      .map(item => item.translation.trim())
  );
  const uniqueOptions = [correct];

  for (const option of pool) {
    const key = option.toLowerCase();
    if (seen.has(key)) continue;
    uniqueOptions.push(option);
    seen.add(key);
    if (uniqueOptions.length === 4) break;
  }

  const shuffled = shuffleArray(uniqueOptions);
  let correctIndex = shuffled.findIndex(option => option.toLowerCase() === lowerCorrect);
  if (correctIndex === -1) {
    shuffled[0] = correct;
    correctIndex = 0;
  }

  return { options: shuffled, correctIndex };
}

export async function phrasalVerbOfTheDay() {
  loadCuratedPhrasalVerbsBank();
  const phrasalVerbEntry = pickCuratedPhrasalVerb();

  if (!phrasalVerbEntry) {
    console.warn('⚠️ Phrasal Verb of the Day не может быть сформирован: phrasal_verbs_bank.json пуст или недоступен');
    return null;
  }

  const { options, correctIndex } = buildPhrasalVerbOptions(phrasalVerbEntry);

  return {
    phrasalVerb: phrasalVerbEntry.phrasalVerb,
    translation: phrasalVerbEntry.translation,
    meaning: phrasalVerbEntry.meaning || phrasalVerbEntry.translation,
    example: phrasalVerbEntry.example,
    hint: phrasalVerbEntry.hint,
    options,
    correctIndex
  };
}

export async function quizOfTheDay() {
  const quizEntry = pickQuizQuestion();
  if (!quizEntry) {
    console.warn('⚠️ Список вопросов квиза пуст');
    return null;
  }
  const options = shuffleArray([...quizEntry.options]);
  let correctIndex = options.findIndex(
    option => option.toLowerCase() === quizEntry.options[quizEntry.correctIndex].toLowerCase()
  );
  if (correctIndex === -1) {
    correctIndex = 0;
  }
  return {
    question: quizEntry.question,
    options,
    correctIndex,
    explanation: quizEntry.explanation || '',
    hint: quizEntry.hint || ''
  };
}

function buildIdiomOptions(entry) {
  const bank = getCuratedIdiomBank();
  const correct = entry.translation.trim();
  const lowerCorrect = correct.toLowerCase();
  const seen = new Set([lowerCorrect]);
  const pool = shuffleArray(
    bank
      .filter(item => item.translation && item.idiom !== entry.idiom)
      .map(item => item.translation.trim())
  );
  const uniqueOptions = [correct];

  for (const option of pool) {
    const key = option.toLowerCase();
    if (seen.has(key)) continue;
    uniqueOptions.push(option);
    seen.add(key);
    if (uniqueOptions.length === 4) break;
  }

  const shuffled = shuffleArray(uniqueOptions);
  let correctIndex = shuffled.findIndex(option => option.toLowerCase() === lowerCorrect);
  if (correctIndex === -1) {
    shuffled[0] = correct;
    correctIndex = 0;
  }

  return { options: shuffled, correctIndex };
}

// ---------------------- Daily Horoscope ----------------------
export async function dailyHoroscope() {
  const SIGNS = [
    'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
    'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'
  ];

  const SIGN_EMOJI = {
    aries: '🐏', taurus: '🐂', gemini: '👯', cancer: '🦀', leo: '🦁', virgo: '🌾',
    libra: '⚖️', scorpio: '🦂', sagittarius: '🏹', capricorn: '🐐', aquarius: '🏺', pisces: '🐟'
  };

  const HORO_HISTORY_FILE = path.resolve(process.cwd(), 'data/horoscope_history.json');
  const HORO_CACHE_FILE = path.resolve(process.cwd(), 'data/horoscope_cache.json');
  const HORO_CACHE_LIMIT = 60;
  const API_BASE_URL = 'https://aztro.sameerkumar.website';

  const usedHoroscopes = new Set();

  const loadHistory = () => {
    try {
      if (fs.existsSync(HORO_HISTORY_FILE)) {
        const arr = JSON.parse(fs.readFileSync(HORO_HISTORY_FILE, 'utf8'));
        if (Array.isArray(arr)) arr.forEach(h => typeof h === 'string' && usedHoroscopes.add(h));
      }
    } catch (error) {
      console.warn('Не удалось загрузить историю гороскопов:', error.message);
    }
  };

  const saveHistory = () => {
    try {
      const dir = path.dirname(HORO_HISTORY_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const items = Array.from(usedHoroscopes);
      const trimmed = items.slice(Math.max(0, items.length - HORO_CACHE_LIMIT));
      fs.writeFileSync(HORO_HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    } catch (error) {
      console.warn('Не удалось сохранить историю гороскопов:', error.message);
    }
  };

  const loadCache = () => {
    try {
      if (!fs.existsSync(HORO_CACHE_FILE)) return null;
      const parsed = JSON.parse(fs.readFileSync(HORO_CACHE_FILE, 'utf8'));
      return parsed || null;
    } catch (error) {
      console.warn('Не удалось загрузить кеш гороскопа:', error.message);
      return null;
    }
  };

  const saveCache = (payload) => {
    try {
      const dir = path.dirname(HORO_CACHE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(HORO_CACHE_FILE, JSON.stringify(payload, null, 2), 'utf8');
    } catch (error) {
      console.warn('Не удалось сохранить кеш гороскопа:', error.message);
    }
  };

  const pruneHistory = () => {
    while (usedHoroscopes.size > HORO_CACHE_LIMIT) {
      const oldest = usedHoroscopes.values().next().value;
      usedHoroscopes.delete(oldest);
    }
  };

  loadHistory();

  const getTodayKey = () => {
    const now = new Date();
    const moscowDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    return moscowDate.toISOString().split('T')[0];
  };

  const buildHeader = () => `🔮 Daily Horoscope ✨\n<em>Your cosmic guidance for today</em>\n\n`;

  const normalize = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim();
  const hashText = (text) => crypto.createHash('md5').update(normalize(text)).digest('hex');

  const buildFallback = (seedValue = getTodayKey()) => {
    const seed = parseInt(crypto.createHash('md5').update(String(seedValue)).digest('hex').slice(0, 8), 16);
    const moods = [
      'Steady day ahead. Keep your pace steady and choose clarity.',
      'Energy builds slowly; patience keeps things smooth.',
      'Small wins appear when you tidy up loose ends.',
      'Your focus is sharper after a calm start.',
      'Balance effort with short breaks for a clear mind.',
      'Curiosity opens a useful door today.'
    ];
    const focuses = [
      'Reconnect with one close person and share your plan',
      'Finish the task you delayed and celebrate the checkmark',
      'Ask one good question that moves work forward',
      'Organize the next two steps instead of the next ten',
      'Move for ten minutes to refresh your thoughts',
      'Learn one new thing and use it in conversation'
    ];
    const nudges = [
      'Evening is best for reflection.',
      'Morning favors planning; afternoon favors action.',
      'A short walk will clear any tension.',
      'Say yes to a small offer of help.',
      'Mute distractions for 30 minutes and you finish faster.',
      'Humor will smooth an awkward moment.'
    ];
    const pick = (arr, offset) => arr[(seed + offset) % arr.length];

    const decoratedFallback = SIGNS.map((sign, index) => {
      const signName = sign.charAt(0).toUpperCase() + sign.slice(1);
      const advice = `${pick(moods, index)} ${pick(focuses, index + 4)} ${pick(nudges, index + 8)}`.replace(/\s+/g, ' ');
      const emoji = SIGN_EMOJI[sign] || '✨';
      return `${emoji} <b>${signName}</b>: ${advice}`;
    }).join('\n\n');

    return buildHeader() + decoratedFallback;
  };

  const todayKey = getTodayKey();

  const persistMessage = (message, source = 'api') => {
    const key = hashText(message);
    usedHoroscopes.add(key);
    pruneHistory();
    saveHistory();
    saveCache({ date: todayKey, message, source });
    return message;
  };

  const cached = loadCache();
  if (cached?.message) {
    // Защитимся от повторов даже если не удалось загрузить историю
    usedHoroscopes.add(hashText(cached.message));
  }
  if (cached?.date === todayKey && cached?.message) {
    console.log('🔮 Используем кеш гороскопа за сегодня');
    return cached.message;
  }

  try {
    console.log('🔮 Загружаем гороскопы из внешнего API');
    const responses = await Promise.all(
      SIGNS.map(async (sign) => {
        const { data } = await axios.post(`${API_BASE_URL}/?sign=${sign}&day=today`);
        return { sign, data };
      })
    );

    const decoratedHoroscopes = responses.map(({ sign, data }) => {
      const emoji = SIGN_EMOJI[sign] || '✨';
      const signName = sign.charAt(0).toUpperCase() + sign.slice(1);
      const extras = [
        data?.mood ? `Mood: ${data.mood}` : null,
        data?.color ? `Color: ${data.color}` : null,
        data?.lucky_number ? `Lucky #: ${data.lucky_number}` : null,
        data?.compatibility ? `Best match: ${data.compatibility}` : null
      ].filter(Boolean).join(' • ');

      const details = extras ? `\n   <i>${extras}</i>` : '';
      return `${emoji} <b>${signName}</b>: ${data?.description || 'Today favors thoughtful actions.'}${details}`;
    });

    const message = buildHeader() + decoratedHoroscopes.join('\n\n');
    const key = hashText(message);
    if (usedHoroscopes.has(key)) {
      console.log('⚠️ Получен повторяющийся гороскоп от API, переходим к резервному варианту');
      return persistMessage(buildFallback(todayKey), 'duplicate_fallback');
    }

    return persistMessage(message, 'api');
  } catch (error) {
    console.error('Ошибка получения гороскопа из API:', error.message);
    return persistMessage(buildFallback(todayKey), 'api_error_fallback');
  }
}

export async function randomCharacter() {
  const types = ["famous actor", "historical figure", "book character", "scientist"];
  const type = types[Math.floor(Math.random() * types.length)];
  const prompt = `Create a ${type} for English practice with:
  - Name
  - Short description (1 sentence)
  - Greeting message
  - Farewell message
  - 3 personality traits
  Return as JSON: {"name": "", "description": "", "greeting": "", "farewell": "", "traits": []}`;

  try {
    const result = await generateEnglishContent(prompt, 'json');
    if (!result || !result.name) {
      console.error('randomCharacter: Получен некорректный результат:', result);
      return {
        name: "Sherlock Holmes",
        description: "Famous detective from London",
        greeting: "Elementary, my dear friend. What brings you to Baker Street today?",
        farewell: "The game is afoot! I must go now.",
        traits: ["observant", "logical", "eccentric"]
      };
    }
    console.log('Сгенерирован персонаж:', result);
    return result;
  } catch (error) {
    console.error('randomCharacter: Ошибка генерации персонажа, используется резервный:', error.message);
    return {
      name: "Sherlock Holmes",
      description: "Famous detective from London",
      greeting: "Elementary, my dear friend. What brings you to Baker Street today?",
      farewell: "The game is afoot! I must go now.",
      traits: ["observant", "logical", "eccentric"]
    };
  }
}

export async function conversationTopic() {
  const prompt = `Generate an interesting conversation topic for English learners (B1 level) with:
  - topic: The topic title
  - questions: 3 related questions
  - vocabulary: Array of 5 objects with word and translation
  Return as JSON: {"topic": "", "questions": [], "vocabulary": [{"word": "", "translation": ""}, ...]}`;
  
  const result = await generateEnglishContent(prompt, 'json');
  return result || {
    topic: "Travel experiences",
    questions: [
      "What's the most interesting place you've visited?",
      "What do you usually pack in your suitcase?",
      "Do you prefer beaches or mountains for vacation?"
    ],
    vocabulary: [
      { word: "sightseeing", translation: "осмотр достопримечательностей" },
      { word: "itinerary", translation: "маршрут" },
      { word: "landmark", translation: "ориентир" },
      { word: "jet lag", translation: "джетлаг" },
      { word: "accommodation", translation: "жилье" }
    ]
  };
}
