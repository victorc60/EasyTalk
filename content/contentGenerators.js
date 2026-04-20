// content/contentGenerators.js
import { OpenAI } from 'openai';
import { CONFIG } from '../config.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { dataFilePath } from '../utils/projectPaths.js';
import { readBankFile, writeJsonArray, pickFromBank } from '../utils/bankUtils.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const WORD_BANK_FILE = dataFilePath('word_bank.json');
const IDIOM_BANK_FILE = dataFilePath('idiom_bank.json');
const PHRASAL_VERBS_BANK_FILE = dataFilePath('phrasal_verbs_bank.json');
const QUIZ_BANK_FILE = dataFilePath('quiz_bank.json');
const FACTS_BANK_FILE = dataFilePath('facts_bank.json');

// Module-level bank caches (used for building answer options/distractors)
let curatedWordBank = [];
let curatedIdiomBank = [];
let curatedPhrasalVerbsBank = [];
let curatedQuizBank = [];
let curatedFactsBank = [];

function normalizeKey(value = '') {
  return String(value ?? '').trim().toLowerCase();
}

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


// ---------------------- Bank loaders (for option building) ----------------------

function loadCuratedWordBank() {
  try {
    if (!fs.existsSync(WORD_BANK_FILE)) {
      curatedWordBank = [];
      return curatedWordBank;
    }
    const rows = readBankFile(WORD_BANK_FILE);
    curatedWordBank = rows
      .filter(entry => {
        if (!entry?.word) return false;
        if (typeof entry.translation === 'string' && entry.translation.trim()) return true;
        if (Array.isArray(entry.translations) && entry.translations.some(t => typeof t === 'string' && t.trim())) return true;
        return false;
      })
      .map(entry => {
        const fromSingle = typeof entry.translation === 'string' ? entry.translation.trim() : '';
        const fromList = Array.isArray(entry.translations)
          ? entry.translations.map(t => (t || '').toString().trim()).filter(Boolean)[0] || ''
          : '';
        return {
          word: entry.word.trim(),
          translation: fromSingle || fromList,
          level: entry.level || 'B1',
          partOfSpeech: entry.partOfSpeech || 'noun',
          topic: entry.topic || 'general',
          example: entry.example || ''
        };
      })
      .filter(entry => entry.word && entry.translation);
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
      curatedIdiomBank = [];
      return curatedIdiomBank;
    }
    const rows = readBankFile(IDIOM_BANK_FILE);
    const seen = new Set();
    curatedIdiomBank = rows
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
    console.log(`📘 Загружено ${curatedIdiomBank.length} идиом из словаря`);
  } catch (error) {
    console.error('Не удалось загрузить идиомы:', error.message);
    curatedIdiomBank = [];
  }
  return curatedIdiomBank;
}

function loadCuratedPhrasalVerbsBank() {
  try {
    if (!fs.existsSync(PHRASAL_VERBS_BANK_FILE)) {
      curatedPhrasalVerbsBank = [];
      return curatedPhrasalVerbsBank;
    }
    const rows = readBankFile(PHRASAL_VERBS_BANK_FILE);
    const seen = new Set();
    curatedPhrasalVerbsBank = rows
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
    console.log(`📘 Загружено ${curatedPhrasalVerbsBank.length} phrasal verbs из словаря`);
  } catch (error) {
    console.error('Не удалось загрузить phrasal verbs:', error.message);
    curatedPhrasalVerbsBank = [];
  }
  return curatedPhrasalVerbsBank;
}

function loadCuratedQuizBank() {
  try {
    if (!fs.existsSync(QUIZ_BANK_FILE)) {
      curatedQuizBank = [];
      return curatedQuizBank;
    }
    const rows = readBankFile(QUIZ_BANK_FILE);
    curatedQuizBank = rows
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

function loadCuratedFactsBank() {
  try {
    if (!fs.existsSync(FACTS_BANK_FILE)) {
      curatedFactsBank = [];
      return curatedFactsBank;
    }
    const rows = readBankFile(FACTS_BANK_FILE);
    const seen = new Set();
    curatedFactsBank = rows
      .filter(entry =>
        entry &&
        typeof entry.id === 'string' && entry.id.trim() &&
        typeof entry.claim === 'string' && entry.claim.trim() &&
        typeof entry.claimRu === 'string' && entry.claimRu.trim() &&
        typeof entry.isTrue === 'boolean' &&
        typeof entry.explanation === 'string' && entry.explanation.trim()
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

function getCuratedWordBank() {
  if (!curatedWordBank.length) return loadCuratedWordBank();
  return curatedWordBank;
}

function getCuratedIdiomBank() {
  if (!curatedIdiomBank.length) return loadCuratedIdiomBank();
  return curatedIdiomBank;
}

function getCuratedPhrasalVerbsBank() {
  if (!curatedPhrasalVerbsBank.length) return loadCuratedPhrasalVerbsBank();
  return curatedPhrasalVerbsBank;
}


export function isWordPresentInBank(word) {
  if (!word) return false;
  const bank = loadCuratedWordBank();
  const normalized = word.trim().toLowerCase();
  return bank.some(entry => entry.word.trim().toLowerCase() === normalized);
}

export function isPhrasalVerbPresentInBank(phrasalVerb) {
  if (!phrasalVerb) return false;
  const bank = loadCuratedPhrasalVerbsBank();
  const normalized = phrasalVerb.trim().toLowerCase();
  return bank.some(entry => entry.phrasalVerb.trim().toLowerCase() === normalized);
}

// Preload banks on module init (needed for building answer options/distractors)
loadCuratedWordBank();
loadCuratedIdiomBank();
loadCuratedPhrasalVerbsBank();
loadCuratedQuizBank();
loadCuratedFactsBank();

// ---------------------- Pick functions ----------------------

function pickCuratedWord() {
  const raw = pickFromBank(WORD_BANK_FILE);
  if (!raw) return null;
  const fromSingle = typeof raw.translation === 'string' ? raw.translation.trim() : '';
  const fromList = Array.isArray(raw.translations)
    ? raw.translations.map(t => (t || '').toString().trim()).filter(Boolean)[0] || ''
    : '';
  return {
    word: raw.word.trim(),
    translation: fromSingle || fromList,
    level: raw.level || 'B1',
    partOfSpeech: raw.partOfSpeech || 'noun',
    topic: raw.topic || 'general',
    example: raw.example || ''
  };
}

function pickCuratedIdiom() {
  const raw = pickFromBank(IDIOM_BANK_FILE);
  if (!raw) return null;
  return {
    idiom: raw.idiom.trim(),
    translation: raw.translation.trim(),
    meaning: raw.meaning || raw.translation.trim(),
    example: raw.example || '',
    hint: raw.hint || ''
  };
}

function pickCuratedPhrasalVerb() {
  const raw = pickFromBank(PHRASAL_VERBS_BANK_FILE);
  if (!raw) return null;
  return {
    phrasalVerb: raw.phrasalVerb.trim(),
    translation: raw.translation.trim(),
    meaning: raw.meaning || raw.translation.trim(),
    example: raw.example || '',
    hint: raw.hint || ''
  };
}

function pickQuizQuestion() {
  const raw = pickFromBank(QUIZ_BANK_FILE);
  if (!raw) return null;
  const options = Array.isArray(raw.options)
    ? raw.options.map(opt => (opt || '').toString().trim()).filter(Boolean)
    : [];
  return {
    question: raw.question.trim(),
    options,
    correctIndex: Math.max(0, Math.min(raw.correctIndex, options.length - 1)),
    explanation: raw.explanation || '',
    hint: raw.hint || '',
    topic: raw.topic || 'general'
  };
}

function pickCuratedFact() {
  return pickFromBank(FACTS_BANK_FILE);
}


// ---------------------- Usage stats ----------------------

export function getPhrasalVerbUsageStats() {
  const rows = readBankFile(PHRASAL_VERBS_BANK_FILE);
  const total = rows.length;
  const used = rows.filter(r => r.isUsed).length;
  const remaining = total - used;
  return {
    total,
    used,
    remaining,
    nextWillRepeat: total > 0 && remaining <= 1,
    usageRate: total > 0 ? Math.round((used / total) * 100) : 0
  };
}

// ---------------------- Helper builders ----------------------

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
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

// ---------------------- Daily game generators ----------------------

export async function dailyFact() {
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

export async function wordOfTheDay() {
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

export async function idiomOfTheDay() {
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

export async function phrasalVerbOfTheDay() {
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

  const HORO_HISTORY_FILE = dataFilePath('horoscope_history.json');
  const HORO_CACHE_FILE = dataFilePath('horoscope_cache.json');
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
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
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

// ---------------------- Mark as used ----------------------

function markAsUsedInBank(filePath, matchFn) {
  try {
    const rows = readBankFile(filePath);
    let changed = false;
    const updated = rows.map(row => {
      if (!row.isUsed && matchFn(row)) {
        changed = true;
        return { ...row, isUsed: true };
      }
      return row;
    });
    if (changed) writeJsonArray(filePath, updated);
    return changed;
  } catch (err) {
    console.error(`Не удалось пометить запись в ${path.basename(filePath)}:`, err.message);
    return false;
  }
}

export function markWordAsUsed(word) {
  const ok = markAsUsedInBank(WORD_BANK_FILE, r => normalizeKey(r?.word) === normalizeKey(word));
  if (ok) loadCuratedWordBank();
  return ok;
}

export function markIdiomAsUsed(idiom) {
  const ok = markAsUsedInBank(IDIOM_BANK_FILE, r => normalizeKey(r?.idiom) === normalizeKey(idiom));
  if (ok) loadCuratedIdiomBank();
  return ok;
}

export function markPhrasalVerbAsUsed(phrasalVerb) {
  const ok = markAsUsedInBank(PHRASAL_VERBS_BANK_FILE, r => normalizeKey(r?.phrasalVerb) === normalizeKey(phrasalVerb));
  if (ok) loadCuratedPhrasalVerbsBank();
  return ok;
}

export function markQuizAsUsed(question) {
  const ok = markAsUsedInBank(QUIZ_BANK_FILE, r => normalizeKey(r?.question) === normalizeKey(question));
  if (ok) loadCuratedQuizBank();
  return ok;
}

export function markFactAsUsed(id) {
  const ok = markAsUsedInBank(FACTS_BANK_FILE, r => normalizeKey(r?.id) === normalizeKey(id));
  if (ok) loadCuratedFactsBank();
  return ok;
}

// ---------------------- Seed cache from DB history ----------------------

function seedBankFromPrompts(filePath, prompts, keyFn, reloadFn) {
  if (!prompts?.length) return;
  const keys = new Set(prompts.map(p => normalizeKey(p)));
  try {
    const rows = readBankFile(filePath);
    let changed = false;
    const updated = rows.map(row => {
      if (!row.isUsed && keys.has(normalizeKey(keyFn(row)))) {
        changed = true;
        return { ...row, isUsed: true };
      }
      return row;
    });
    if (changed) {
      writeJsonArray(filePath, updated);
      reloadFn();
    }
  } catch (err) {
    console.error(`Ошибка seed для ${path.basename(filePath)}:`, err.message);
  }
}

export function seedUsedWordsCache(words) {
  seedBankFromPrompts(WORD_BANK_FILE, words, r => r?.word, loadCuratedWordBank);
}

export function seedUsedIdiomsCache(prompts) {
  seedBankFromPrompts(IDIOM_BANK_FILE, prompts, r => r?.idiom, loadCuratedIdiomBank);
}

export function seedUsedPhrasalVerbsCache(prompts) {
  seedBankFromPrompts(PHRASAL_VERBS_BANK_FILE, prompts, r => r?.phrasalVerb, loadCuratedPhrasalVerbsBank);
}

export function seedUsedQuizCache(prompts) {
  seedBankFromPrompts(QUIZ_BANK_FILE, prompts, r => r?.question, loadCuratedQuizBank);
}
