// content/contentGenerators.js
import { OpenAI } from 'openai';
import { CONFIG } from '../config.js';
import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const usedFactsCache = new Set();
const CACHE_LIMIT = 200; // Increased to store more facts and reduce repetition
function hashString(str) {
  if (!str) return ''; // Защита от пустых строк
  return crypto.createHash('md5').update(str).digest('hex').substring(0, 16); // MD5, обрезанный до 16 символов
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

export async function dailyFact() {
  // Array of fascinating topics to choose from
  const TOPICS = [
    'science', 'space', 'animals', 'history', 'technology', 'human_body', 
    'ocean', 'weather', 'food', 'art', 'music', 'sports', 'geography', 
    'psychology', 'medicine', 'engineering', 'nature', 'culture', 'mathematics',
    'architecture', 'transportation', 'communication', 'energy', 'environment'
  ];
  
  // Select a random topic
  const selectedTopic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
  
  const PROMPT = `Generate a mind-blowing, fascinating fact about ${selectedTopic} that will make people say "Wow, that's incredible!" The fact should be:
  - Completely true and scientifically accurate
  - Surprising and counterintuitive
  - Engaging for teenagers and adults
  - Something that makes people want to share it
  - Not commonly known
  
  Include:
  - The fact in English (1-2 sentences, make it exciting)
  - Translation in Russian (accurate and natural)
  - Brief explanation of why it's fascinating (1 sentence)
  
  Format exactly as:
  🇬🇧 [fact]
  🇷🇺 [translation]
  💡 [explanation]
  
  Make it truly amazing and unforgettable!`;
  
  const MAX_ATTEMPTS = 5;
  const DEFAULT_FACTS = [
    `🇬🇧 Honey never spoils! Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still perfectly edible.\n🇷🇺 Мёд никогда не портится! Археологи нашли горшки с мёдом в древнеегипетских гробницах возрастом более 3000 лет, и он всё ещё съедобен.\n💡 Honey's low moisture content and acidic pH create an environment where bacteria cannot survive!`,
    `🇬🇧 A day on Venus is longer than its year! Venus takes 243 Earth days to rotate on its axis, but only 225 Earth days to orbit the Sun.\n🇷🇺 День на Венере длиннее её года! Венере нужно 243 земных дня, чтобы обернуться вокруг оси, но только 225 дней для обращения вокруг Солнца.\n💡 This means if you lived on Venus, you'd celebrate your birthday before you'd see the next sunrise!`,
    `🇬🇧 Octopuses have three hearts, nine brains, and blue blood! Two hearts pump blood to the gills, while the third pumps it to the rest of the body.\n🇷🇺 У осьминогов три сердца, девять мозгов и синяя кровь! Два сердца качают кровь к жабрам, а третье — к остальному телу.\n💡 Their blood is blue because it contains copper instead of iron like ours!`,
    `🇬🇧 Bananas are berries, but strawberries aren't! In botanical terms, bananas qualify as berries while strawberries are actually "aggregate fruits."\n🇷🇺 Бананы — это ягоды, а клубника — нет! По ботаническим терминам бананы считаются ягодами, а клубника — "сложными плодами".\n💡 The definition of a berry is a fruit with seeds inside, which bananas have!`,
    `🇬🇧 Your brain uses 20% of your body's energy but only weighs 2% of your body weight! It's the most energy-hungry organ in your body.\n🇷🇺 Мозг использует 20% энергии тела, но весит только 2% от веса тела! Это самый энергозатратный орган в организме.\n💡 That's why you feel tired after intense thinking — your brain is literally burning calories!`,
    `🇬🇧 Lightning strikes the Earth about 100 times every second! That's over 8 million lightning strikes per day.\n🇷🇺 Молния ударяет в Землю примерно 100 раз каждую секунду! Это более 8 миллионов ударов молний в день.\n💡 Lightning is hotter than the surface of the Sun, reaching temperatures of 30,000°C!`,
    `🇬🇧 There are more possible games of chess than there are atoms in the observable universe! The number is approximately 10^120.\n🇷🇺 Возможных партий в шахматы больше, чем атомов в наблюдаемой вселенной! Это число примерно 10^120.\n💡 This is why no computer can ever calculate all possible chess moves!`,
    `🇬🇧 A group of flamingos is called a "flamboyance"! These pink birds are so social that they form groups of up to 10,000 birds.\n🇷🇺 Группа фламинго называется "фламандство"! Эти розовые птицы настолько общительны, что образуют группы до 10 000 особей.\n💡 The word "flamboyance" perfectly captures their showy, colorful nature!`,
    `🇬🇧 The Great Wall of China is not visible from space with the naked eye! This is a common myth, but astronauts confirm it's not true.\n🇷🇺 Великую Китайскую стену нельзя увидеть из космоса невооружённым глазом! Это распространённый миф, но астронавты подтверждают, что это неправда.\n💡 The wall is only about 30 feet wide, which is too narrow to see from space!`,
    `🇬🇧 Your body contains enough iron to make a 3-inch nail! Iron is essential for carrying oxygen in your blood.\n🇷🇺 В вашем теле достаточно железа, чтобы сделать 3-дюймовый гвоздь! Железо необходимо для переноса кислорода в крови.\n💡 That's why iron deficiency can make you feel tired and weak!`
  ];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      // Add topic variety to the prompt to avoid repetition
      const topicPrompt = attempt > 0 ? `\n\nTry a different topic from this list: ${TOPICS.join(', ')}. Avoid repeating any previous facts.` : '';
      const fact = await generateEnglishContent(PROMPT + topicPrompt);

      // Проверяем, что факт не пустой и соответствует формату
      if (!fact || fact.trim() === '' || !fact.includes('🇬🇧') || !fact.includes('🇷🇺') || !fact.includes('💡')) {
        console.warn(`Attempt ${attempt + 1}: Invalid fact format:`, fact);
        continue;
      }

      // Enhanced duplicate detection - check both the beginning and key phrases
      const factKey = hashString(fact.substring(0, 100)); // Increased to 100 characters for better uniqueness
      const factKey2 = hashString(fact.toLowerCase().replace(/[^a-zа-я]/g, '').substring(0, 50)); // Remove punctuation and spaces
      
      if (!factKey || !factKey2) {
        console.warn(`Attempt ${attempt + 1}: Failed to generate fact keys for:`, fact.substring(0, 50));
        continue;
      }

      // Check if this fact or a very similar one has been used
      const isDuplicate = usedFactsCache.has(factKey) || usedFactsCache.has(factKey2);
      
      if (!isDuplicate) {
        // Ограничиваем размер кэша
        if (usedFactsCache.size >= CACHE_LIMIT) {
          const oldestKey = usedFactsCache.values().next().value;
          usedFactsCache.delete(oldestKey);
          console.log('Removed oldest fact key from cache:', oldestKey);
        }
        usedFactsCache.add(factKey);
        usedFactsCache.add(factKey2);
        console.log(`New fascinating fact generated about ${selectedTopic}: ${fact.substring(0, 100)}...`);
        return fact;
      } else {
        console.warn(`Attempt ${attempt + 1}: Fact already used (keys: ${factKey}, ${factKey2})`);
      }
    } catch (error) {
      console.warn(`Attempt ${attempt + 1} failed:`, error.message);
    }
  }

  console.warn(`Failed to generate new fact after ${MAX_ATTEMPTS} attempts, returning default fact`);
  // Return a random default fact that hasn't been used recently
  const availableDefaultFacts = DEFAULT_FACTS.filter(fact => {
    const factKey = hashString(fact.substring(0, 100));
    return !usedFactsCache.has(factKey);
  });
  
  if (availableDefaultFacts.length > 0) {
    const selectedFact = availableDefaultFacts[Math.floor(Math.random() * availableDefaultFacts.length)];
    const factKey = hashString(selectedFact.substring(0, 100));
    usedFactsCache.add(factKey);
    return selectedFact;
  } else {
    // If all default facts have been used, clear some cache and return a random one
    const oldestKey = usedFactsCache.values().next().value;
    if (oldestKey) usedFactsCache.delete(oldestKey);
  return DEFAULT_FACTS[Math.floor(Math.random() * DEFAULT_FACTS.length)];
  }
}

// Добавляем в начало файла
const usedWordsCache = new Set();
const MAX_CACHE_SIZE = 365; // Храним 365 последних слов (около года)
const WORD_HISTORY_FILE = path.resolve(process.cwd(), 'data/word_history.json');
const WORD_BANK_FILE = path.resolve(process.cwd(), 'data/word_bank.json');
let curatedWordBank = [];
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
        hint: entry.hint || ''
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
        hint: entry.hint || ''
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

function getCuratedWordBank() {
  if (!curatedWordBank.length) {
    return loadCuratedWordBank();
  }
  return curatedWordBank;
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

// Функция для ручного добавления слова в использованные (для исправления повторов)
export function addWordToUsedHistory(word) {
  const wordLower = word.trim().toLowerCase();
  usedWordsCache.add(wordLower);
  removeWordFromCuratedPool(wordLower);
  saveUsedWordsToDisk();
  console.log(`🔧 Добавлено слово "${word}" в историю использованных слов`);
}

export async function wordOfTheDay() {
  const wordEntry = pickCuratedWord();
  
  if (!wordEntry) {
    console.warn('⚠️ Словарь не доступен, используем резервное слово');
    return getDefaultWordWithOptions();
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

function getDefaultWordWithOptions() {
  const defaultWords = [
    {
      word: "ephemeral",
      translation: "недолговечный",
      options: [
        "недолговечный",
        "вечный",
        "красивый", 
        "временный"
      ],
      example: "The beauty of cherry blossoms is ephemeral.",
      fact: "From Greek 'ephemeros' meaning 'lasting only one day'",
      mistakes: "Don't confuse with 'eternal' - they're opposites"
    },
    {
      word: "quintessential",
      translation: "наиболее типичный",
      options: [
        "наиболее типичный",
        "важный",
        "красивый",
        "редкий"
      ],
      example: "He's the quintessential English gentleman.",
      fact: "Comes from 'quintessence' - the fifth element in ancient philosophy",
      mistakes: "Often misspelled as 'quintessential' (missing the 'e')"
    },
    {
      word: "serendipity",
      translation: "счастливая случайность",
      options: [
        "счастливая случайность",
        "удача",
        "везение",
        "случай"
      ],
      example: "Finding this book was pure serendipity.",
      fact: "Coined by Horace Walpole in 1754, inspired by Persian fairy tale",
      mistakes: "Often confused with 'luck' - serendipity implies discovery"
    },
    {
      word: "ubiquitous",
      translation: "вездесущий",
      options: [
        "вездесущий",
        "важный",
        "популярный",
        "известный"
      ],
      example: "Smartphones have become ubiquitous in modern life.",
      fact: "From Latin 'ubique' meaning 'everywhere'",
      mistakes: "Don't confuse with 'popular' - ubiquitous means everywhere present"
    }
  ];
  
  // Ищем дефолтное слово, которое ещё не использовалось
  for (const word of defaultWords) {
    const key = word.word.trim().toLowerCase();
    console.log(`🔍 Проверяем дефолтное слово: "${word.word}" (${key})`);
    if (!usedWordsCache.has(key)) {
      usedWordsCache.add(key);
      // Ограничиваем размер кэша и сохраняем
      if (usedWordsCache.size > MAX_CACHE_SIZE) {
        const oldest = usedWordsCache.values().next().value;
        usedWordsCache.delete(oldest);
      }
      saveUsedWordsToDisk();
      console.log(`✅ Дефолтное слово "${word.word}" добавлено в историю`);
      // Перемешиваем варианты ответов
      const shuffledOptions = shuffleArray([...word.options]);
      const correctIndex = shuffledOptions.findIndex(
        option => option.toLowerCase() === word.translation.toLowerCase()
      );
      return { ...word, options: shuffledOptions, correctIndex: correctIndex >= 0 ? correctIndex : 0 };
    } else {
      console.log(`⚠️ Дефолтное слово "${word.word}" уже использовалось ранее`);
    }
  }
  
  // Если все дефолтные слова уже использовались, возвращаем первое с перемешанными вариантами
  const firstWord = defaultWords[0];
  const key = firstWord.word.trim().toLowerCase();
  console.log(`⚠️ Все дефолтные слова использованы, возвращаем "${firstWord.word}"`);
  usedWordsCache.add(key);
  if (usedWordsCache.size > MAX_CACHE_SIZE) {
    const oldest = usedWordsCache.values().next().value;
    usedWordsCache.delete(oldest);
  }
  saveUsedWordsToDisk();
  const shuffledOptions = shuffleArray([...firstWord.options]);
  const correctIndex = shuffledOptions.findIndex(
    option => option.toLowerCase() === firstWord.translation.toLowerCase()
  );
  return { ...firstWord, options: shuffledOptions, correctIndex: correctIndex >= 0 ? correctIndex : 0 };
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

  for (const phrasalVerb of defaultPhrasalVerbs) {
    const key = phrasalVerb.phrasalVerb.trim().toLowerCase();
    if (!usedPhrasalVerbsCache.has(key)) {
      usedPhrasalVerbsCache.add(key);
      if (usedPhrasalVerbsCache.size > MAX_CACHE_SIZE) {
        const oldest = usedPhrasalVerbsCache.values().next().value;
        usedPhrasalVerbsCache.delete(oldest);
      }
      saveUsedPhrasalVerbsToDisk();
      const { options, correctIndex } = buildPhrasalVerbOptions(phrasalVerb);
      return { ...phrasalVerb, options, correctIndex };
    }
  }

  // Если всё использовано, возвращаем первую
  const first = defaultPhrasalVerbs[0];
  const { options, correctIndex } = buildPhrasalVerbOptions(first);
  return { ...first, options, correctIndex };
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

  for (const idiom of defaultIdioms) {
    const key = idiom.idiom.trim().toLowerCase();
    if (!usedIdiomsCache.has(key)) {
      usedIdiomsCache.add(key);
      if (usedIdiomsCache.size > MAX_CACHE_SIZE) {
        const oldest = usedIdiomsCache.values().next().value;
        usedIdiomsCache.delete(oldest);
      }
      saveUsedIdiomsToDisk();
      const { options, correctIndex } = buildIdiomOptions(idiom);
      return { ...idiom, options, correctIndex };
    }
  }

  // Если всё использовано, возвращаем первую
  const first = defaultIdioms[0];
  const { options, correctIndex } = buildIdiomOptions(first);
  return { ...first, options, correctIndex };
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
