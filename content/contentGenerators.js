// content/contentGenerators.js
import { OpenAI } from 'openai';
import { CONFIG } from '../config.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const FACTS_BANK_FILE = path.resolve(process.cwd(), 'data/facts_bank.json');
let curatedFactsBank = [];
let factCursor = -1;

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
  const bank = getCuratedFactsBank();
  if (!bank.length) {
    console.warn('⚠️ Банк фактов пуст');
    return null;
  }

  const factEntry = getNextSequentialEntry(bank, 'fact');

  if (!factEntry) {
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

const WORD_BANK_FILE = path.resolve(process.cwd(), 'data/word_bank.json');
let curatedWordBank = [];
let wordCursor = -1;
const IDIOM_BANK_FILE = path.resolve(process.cwd(), 'data/idiom_bank.json');
let curatedIdiomBank = [];
let idiomCursor = -1;
const PHRASAL_VERBS_BANK_FILE = path.resolve(process.cwd(), 'data/phrasal_verbs_bank.json');
let curatedPhrasalVerbsBank = [];
let phrasalVerbCursor = -1;
const QUIZ_BANK_FILE = path.resolve(process.cwd(), 'data/quiz_bank.json');
let curatedQuizBank = [];
let quizCursor = -1;
let defaultIdiomCursor = -1;
let defaultPhrasalVerbCursor = -1;

function getNextCursorValue(bankLength, currentCursor) {
  if (!bankLength) {
    return -1;
  }
  if (currentCursor < 0 || currentCursor >= bankLength - 1) {
    return 0;
  }
  return currentCursor + 1;
}

function getNextSequentialEntry(bank, type) {
  if (!Array.isArray(bank) || !bank.length) {
    return null;
  }

  switch (type) {
    case 'fact':
      factCursor = getNextCursorValue(bank.length, factCursor);
      return bank[factCursor] ?? null;
    case 'word':
      wordCursor = getNextCursorValue(bank.length, wordCursor);
      return bank[wordCursor] ?? null;
    case 'idiom':
      idiomCursor = getNextCursorValue(bank.length, idiomCursor);
      return bank[idiomCursor] ?? null;
    case 'phrasal_verb':
      phrasalVerbCursor = getNextCursorValue(bank.length, phrasalVerbCursor);
      return bank[phrasalVerbCursor] ?? null;
    case 'quiz':
      quizCursor = getNextCursorValue(bank.length, quizCursor);
      return bank[quizCursor] ?? null;
    default:
      return null;
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
      .filter(entry =>
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
      .map(entry => ({
        id: entry.id.trim(),
        claim: entry.claim.trim(),
        claimRu: entry.claimRu.trim(),
        isTrue: entry.isTrue,
        explanation: entry.explanation.trim()
      }))
      .filter(entry => {
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
      .filter(entry => entry?.word && entry?.translation)
      .map(entry => ({
        word: entry.word.trim(),
        translation: entry.translation.trim(),
        level: entry.level || 'B1',
        partOfSpeech: entry.partOfSpeech || 'noun',
        topic: entry.topic || 'general'
      }));
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

loadCuratedWordBank();
loadCuratedIdiomBank();
loadCuratedPhrasalVerbsBank();
loadCuratedQuizBank();
loadCuratedFactsBank();

export function addWordToUsedHistory(word) {
  if (!word) {
    return;
  }

  const bank = getCuratedWordBank();
  const normalized = word.trim().toLowerCase();
  const index = bank.findIndex((entry) => entry.word.trim().toLowerCase() === normalized);

  if (index === -1) {
    console.warn(`⚠️ Слово "${word}" не найдено в текущем word bank`);
    return;
  }

  wordCursor = index;
  console.log(`🔧 Следующее слово дня будет выбрано после "${word}"`);
}

export async function wordOfTheDay() {
  loadCuratedWordBank();
  const wordEntry = pickCuratedWordSequential();
  
  if (!wordEntry) {
    console.warn('⚠️ Словарь слов пуст или недоступен');
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

export function getPhrasalVerbUsageStats() {
  const bank = getCuratedPhrasalVerbsBank();
  const total = bank.length;
  const used = total > 0 ? Math.min(phrasalVerbCursor + 1, total) : 0;
  const remaining = Math.max(total - used, 0);

  return {
    total,
    used,
    remaining,
    nextWillRepeat: total > 0 && remaining === 0,
    usageRate: total > 0 ? Math.round((used / total) * 100) : 0
  };
}

function pickCuratedWordSequential() {
  const bank = getCuratedWordBank();
  return getNextSequentialEntry(bank, 'word');
}

function pickCuratedIdiom() {
  return getNextSequentialEntry(getCuratedIdiomBank(), 'idiom');
}

function pickCuratedPhrasalVerb() {
  return getNextSequentialEntry(getCuratedPhrasalVerbsBank(), 'phrasal_verb');
}

function pickQuizQuestion() {
  return getNextSequentialEntry(getCuratedQuizBank(), 'quiz');
}

function buildAnswerOptions(entry) {
  const bank = getCuratedWordBank();
  const correct = entry.translation.trim();
  const lowerCorrect = correct.toLowerCase();
  const distractors = [];
  const seen = new Set([lowerCorrect]);
  const pool = shuffleArray(
    bank
      .filter(item => item.translation && item.word !== entry.word)
      .map(item => item.translation.trim())
  );

  for (const option of pool) {
    const key = option.toLowerCase();
    if (seen.has(key)) continue;
    distractors.push(option);
    seen.add(key);
    if (distractors.length === 3) break;
  }

  const fallbackTranslations = ['радость', 'море', 'карта', 'дружба', 'память', 'снег'];
  for (const fallback of fallbackTranslations) {
    if (distractors.length === 3) break;
    const key = fallback.toLowerCase();
    if (seen.has(key)) continue;
    distractors.push(fallback);
    seen.add(key);
  }

  const uniqueOptions = [correct, ...distractors].slice(0, 4);
  while (uniqueOptions.length < 4) {
    const filler = fallbackTranslations[Math.floor(Math.random() * fallbackTranslations.length)];
    const key = filler.toLowerCase();
    if (uniqueOptions.some(option => option.toLowerCase() === key)) continue;
    uniqueOptions.push(filler);
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
  const idiomEntry = pickCuratedIdiom();

  if (!idiomEntry) {
    console.warn('⚠️ Список идиом пуст, используем резервную идиому');
    return getDefaultIdiomWithOptions();
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
  const distractors = [];
  const seen = new Set([lowerCorrect]);
  const pool = shuffleArray(
    bank
      .filter(item => item.translation && item.phrasalVerb !== entry.phrasalVerb)
      .map(item => item.translation.trim())
  );

  for (const option of pool) {
    const key = option.toLowerCase();
    if (seen.has(key)) continue;
    distractors.push(option);
    seen.add(key);
    if (distractors.length === 3) break;
  }

  const fallbackTranslations = ['вставать', 'выходить', 'возвращаться', 'продолжать', 'начинать'];
  for (const fallback of fallbackTranslations) {
    if (distractors.length === 3) break;
    const key = fallback.toLowerCase();
    if (seen.has(key)) continue;
    distractors.push(fallback);
    seen.add(key);
  }

  const uniqueOptions = [correct, ...distractors].slice(0, 4);
  while (uniqueOptions.length < 4) {
    const filler = fallbackTranslations[Math.floor(Math.random() * fallbackTranslations.length)];
    const key = filler.toLowerCase();
    if (uniqueOptions.some(option => option.toLowerCase() === key)) continue;
    uniqueOptions.push(filler);
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
  const phrasalVerbEntry = pickCuratedPhrasalVerb();

  if (!phrasalVerbEntry) {
    console.warn('⚠️ Список phrasal verbs пуст, используем резервный');
    return getDefaultPhrasalVerbWithOptions();
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

function getDefaultPhrasalVerbWithOptions() {
  const defaultPhrasalVerbs = [
    {
      phrasalVerb: 'give up',
      translation: 'сдаваться',
      meaning: 'прекращать попытки или отказываться от чего-то',
      example: "Don't give up on your dreams.",
      hint: 'момент, когда опускаешь руки'
    },
    {
      phrasalVerb: 'look forward to',
      translation: 'ждать с нетерпением',
      meaning: 'с нетерпением ожидать чего-то',
      example: 'I look forward to seeing you tomorrow.',
      hint: 'думать о будущем как о подарке'
    },
    {
      phrasalVerb: 'put off',
      translation: 'откладывать',
      meaning: 'переносить на более позднее время',
      example: "We had to put off the meeting until next week.",
      hint: 'переставить дело на полку'
    },
    {
      phrasalVerb: 'get along',
      translation: 'ладить',
      meaning: 'хорошо общаться с кем-то',
      example: 'They get along very well.',
      hint: 'быть на одной волне'
    }
  ];

  defaultPhrasalVerbCursor = getNextCursorValue(defaultPhrasalVerbs.length, defaultPhrasalVerbCursor);
  const entry = defaultPhrasalVerbs[defaultPhrasalVerbCursor];
  const { options, correctIndex } = buildPhrasalVerbOptions(entry);
  return { ...entry, options, correctIndex };
}

function buildIdiomOptions(entry) {
  const bank = getCuratedIdiomBank();
  const correct = entry.translation.trim();
  const lowerCorrect = correct.toLowerCase();
  const distractors = [];
  const seen = new Set([lowerCorrect]);
  const pool = shuffleArray(
    bank
      .filter(item => item.translation && item.idiom !== entry.idiom)
      .map(item => item.translation.trim())
  );

  for (const option of pool) {
    const key = option.toLowerCase();
    if (seen.has(key)) continue;
    distractors.push(option);
    seen.add(key);
    if (distractors.length === 3) break;
  }

  const fallbackTranslations = ['держать язык за зубами', 'выйти из себя', 'долго и счастливо', 'сквозь пальцы', 'не в своей тарелке'];
  for (const fallback of fallbackTranslations) {
    if (distractors.length === 3) break;
    const key = fallback.toLowerCase();
    if (seen.has(key)) continue;
    distractors.push(fallback);
    seen.add(key);
  }

  const uniqueOptions = [correct, ...distractors].slice(0, 4);
  while (uniqueOptions.length < 4) {
    const filler = fallbackTranslations[Math.floor(Math.random() * fallbackTranslations.length)];
    const key = filler.toLowerCase();
    if (uniqueOptions.some(option => option.toLowerCase() === key)) continue;
    uniqueOptions.push(filler);
  }

  const shuffled = shuffleArray(uniqueOptions);
  let correctIndex = shuffled.findIndex(option => option.toLowerCase() === lowerCorrect);
  if (correctIndex === -1) {
    shuffled[0] = correct;
    correctIndex = 0;
  }

  return { options: shuffled, correctIndex };
}

function getDefaultIdiomWithOptions() {
  const defaultIdioms = [
    {
      idiom: 'a piece of cake',
      translation: 'очень легко',
      meaning: 'что-то очень простое',
      example: 'The test was a piece of cake for her.',
      hint: 'Сладость для простоты'
    },
    {
      idiom: 'break the ice',
      translation: 'растопить лёд',
      meaning: 'снять напряжение, начать разговор',
      example: 'He told a joke to break the ice.',
      hint: 'Начало общения'
    },
    {
      idiom: 'cost an arm and a leg',
      translation: 'стоить целое состояние',
      meaning: 'быть очень дорогим',
      example: 'That car cost him an arm and a leg.',
      hint: 'Про деньги'
    },
    {
      idiom: 'hit the books',
      translation: 'удариться в учёбу',
      meaning: 'усиленно готовиться к учёбе',
      example: 'I need to hit the books tonight.',
      hint: 'Про учёбу'
    }
  ];

  defaultIdiomCursor = getNextCursorValue(defaultIdioms.length, defaultIdiomCursor);
  const entry = defaultIdioms[defaultIdiomCursor];
  const { options, correctIndex } = buildIdiomOptions(entry);
  return { ...entry, options, correctIndex };
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
