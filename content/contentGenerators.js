// content/contentGenerators.js
import { OpenAI } from 'openai';
import { CONFIG } from '../config.js';
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
      }
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
  } catch (error) {
    console.error('Не удалось сохранить историю слов:', error.message);
  }
}

// Инициализируем кэш слов из файла при загрузке модуля
loadUsedWordsFromDisk();

export async function wordOfTheDay() {
  const prompt = `Generate a unique B1-level English word with multiple choice options:
  - The correct word and its Russian translation
  - 3 incorrect but plausible Russian translations
  - Example sentence using the correct word
  - Interesting fact about the word
  - Common mistakes with this word
  Return as JSON: {
    "word": "correct_english_word",
    "translation": "correct_russian_translation", 
    "options": [
      "correct_russian_translation",
      "incorrect_option_1",
      "incorrect_option_2", 
      "incorrect_option_3"
    ],
    "example": "example_sentence",
    "fact": "interesting_fact",
    "mistakes": "common_mistakes"
  }
  Make sure the incorrect options are plausible but clearly wrong.`;
  
  let attempts = 0;
  const maxAttempts = 5;
  let result = null;

  while (attempts < maxAttempts) {
    result = await generateEnglishContent(prompt, 'json');
    
    // Если не удалось сгенерировать слово, используем дефолтное
    if (!result || !result.word || !result.options || result.options.length !== 4) {
      return getDefaultWordWithOptions();
    }
    
    // Проверяем, не использовалось ли это слово ранее
    const wordLower = result.word.trim().toLowerCase();
    if (!usedWordsCache.has(wordLower)) {
      usedWordsCache.add(wordLower);
      
      // Ограничиваем размер кэша
      if (usedWordsCache.size > MAX_CACHE_SIZE) {
        const oldest = usedWordsCache.values().next().value;
        usedWordsCache.delete(oldest);
      }
      // Сохраняем обновлённую историю на диск
      saveUsedWordsToDisk();
      
      // Перемешиваем варианты ответов
      const shuffledOptions = shuffleArray([...result.options]);
      result.options = shuffledOptions;
      
      return result;
    }
    
    attempts++;
  }
  
  // Если после нескольких попыток всё равно получаем повтор
  console.warn(`Не удалось сгенерировать уникальное слово после ${maxAttempts} попыток`);
  return getDefaultWordWithOptions();
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
    if (!usedWordsCache.has(key)) {
      usedWordsCache.add(key);
      // Ограничиваем размер кэша и сохраняем
      if (usedWordsCache.size > MAX_CACHE_SIZE) {
        const oldest = usedWordsCache.values().next().value;
        usedWordsCache.delete(oldest);
      }
      saveUsedWordsToDisk();
      // Перемешиваем варианты ответов
      const shuffledOptions = shuffleArray([...word.options]);
      return { ...word, options: shuffledOptions };
    }
  }
  
  // Если все дефолтные слова уже использовались, возвращаем первое с перемешанными вариантами
  const firstWord = defaultWords[0];
  const key = firstWord.word.trim().toLowerCase();
  usedWordsCache.add(key);
  if (usedWordsCache.size > MAX_CACHE_SIZE) {
    const oldest = usedWordsCache.values().next().value;
    usedWordsCache.delete(oldest);
  }
  saveUsedWordsToDisk();
  const shuffledOptions = shuffleArray([...firstWord.options]);
  return { ...firstWord, options: shuffledOptions };
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