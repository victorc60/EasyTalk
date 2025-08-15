// content/contentGenerators.js
import { OpenAI } from 'openai';
import { CONFIG } from '../config.js';
import crypto from 'crypto';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const usedFactsCache = new Set();
const CACHE_LIMIT = 100;
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
  const PROMPT = `Generate an interesting, unique English language fact with Russian translation that hasn't been used recently. Include:
  - The fact in English (1-2 sentences, engaging for teenagers)
  - Translation in Russian (accurate and concise)
  - Brief explanation (1 sentence, simple)
  Format exactly as:
  🇬🇧 [fact]
  🇷🇺 [translation]
  💡 [explanation]
  Ensure the fact is new, fun, and related to English language or culture. Avoid repeating facts from previous responses.`;
  
  const MAX_ATTEMPTS = 5;
  const DEFAULT_FACTS = [
    `🇬🇧 The word "quiz" was invented in 1781 by a Dublin theater owner who made a bet he could create a new word overnight.\n🇷🇺 Слово "quiz" придумал в 1781 году владелец театра в Дублине, поспорив, что создаст новое слово за ночь.\n💡 It became popular as a term for tests and games!`,
    `🇬🇧 English has "contronyms" like "dust," which can mean both to add dust (to a cake) and to remove dust (from furniture).\n🇷🇺 В английском есть "контронимы", например, "dust" — посыпать пылью (на торт) или убирать пыль (с мебели).\n💡 These words confuse learners due to opposite meanings!`,
    `🇬🇧 The longest English word is "pneumonoultramicroscopicsilicovolcanoconiosis," a 45-letter term for a lung disease.\n🇷🇺 Самое длинное английское слово — "pneumonoultramicroscopicsilicovolcanoconiosis", 45 букв, означает болезнь лёгких.\n💡 It was created to be super long and is rarely used!`,
    `🇬🇧 English has over 1 million words, absorbing terms like "zombie" (West African) and "ketchup" (Chinese "kê-tsiap").\n🇷🇺 В английском >1 млн слов: "zombie" (африк.), "кетчуп" (кит. "kê-tsiap").\n💡 Borrowed words reflect English's global history!`
  ];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const fact = await generateEnglishContent(
        PROMPT + (attempt > 0 ? "\n\nAvoid repeating any previous facts." : "")
      );

      // Проверяем, что факт не пустой и соответствует формату
      if (!fact || fact.trim() === '' || !fact.includes('🇬🇧') || !fact.includes('🇷🇺') || !fact.includes('💡')) {
        console.warn(`Attempt ${attempt + 1}: Invalid fact format:`, fact);
        continue;
      }

      // Хэшируем первые 50 символов для уникальности
      const factKey = hashString(fact.substring(0, 50));
      if (!factKey) {
        console.warn(`Attempt ${attempt + 1}: Failed to generate fact key for:`, fact.substring(0, 50));
        continue;
      }

      if (!usedFactsCache.has(factKey)) {
        // Ограничиваем размер кэша
        if (usedFactsCache.size >= CACHE_LIMIT) {
          const oldestKey = usedFactsCache.values().next().value;
          usedFactsCache.delete(oldestKey);
          console.log('Removed oldest fact key from cache:', oldestKey);
        }
        usedFactsCache.add(factKey); // Используем add вместо set
        console.log(`New fact generated: ${fact}`);
        return fact;
      } else {
        console.warn(`Attempt ${attempt + 1}: Fact already used (key: ${factKey})`);
      }
    } catch (error) {
      console.warn(`Attempt ${attempt + 1} failed:`, error.message);
    }
  }

  console.warn(`Failed to generate new fact after ${MAX_ATTEMPTS} attempts, returning default fact`);
  return DEFAULT_FACTS[Math.floor(Math.random() * DEFAULT_FACTS.length)];
}

// Добавляем в начало файла
const usedWordsCache = new Set();
const MAX_CACHE_SIZE = 100; // Храним 100 последних слов

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
    const wordLower = result.word.toLowerCase();
    if (!usedWordsCache.has(wordLower)) {
      usedWordsCache.add(wordLower);
      
      // Ограничиваем размер кэша
      if (usedWordsCache.size > MAX_CACHE_SIZE) {
        const oldest = usedWordsCache.values().next().value;
        usedWordsCache.delete(oldest);
      }
      
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
    if (!usedWordsCache.has(word.word.toLowerCase())) {
      usedWordsCache.add(word.word.toLowerCase());
      // Перемешиваем варианты ответов
      const shuffledOptions = shuffleArray([...word.options]);
      return { ...word, options: shuffledOptions };
    }
  }
  
  // Если все дефолтные слова уже использовались, возвращаем первое с перемешанными вариантами
  const firstWord = defaultWords[0];
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