// content/contentGenerators.js
import { OpenAI } from 'openai';
import { CONFIG } from '../config.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const usedFactsCache = new Set();

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
  const PROMPT = `Generate an interesting English language fact with Russian translation that hasn't been used recently. Include:
  - The fact in English
  - Translation in Russian
  - Brief explanation (1 sentence)
  Format:
  🇬🇧 [fact]
  🇷🇺 [translation]
  💡 [explanation]`; // Ваш промпт
  const MAX_ATTEMPTS = 5;
  const DEFAULT_FACTS = [
    `🇬🇧 English has over 1 million words, absorbing terms like  "zombie" (West African,(god/spirit, meaning corpses resurrected by witch doctors), and "ketchup" (Chinese "kê-tsiap", meaning fish sauce)\n🇷🇺 В английском >1 млн слов: "tycoon" (яп.), "zombie" (африк.), "кетчуп" (кит. "kê-tsiap")\n💡 Слова-заимствования — как языковые "трофеи" колониальной истории`
];
  
   
  
    
  
    

  

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const fact = await generateEnglishContent(
        PROMPT + (attempt > 0 ? "\n\nAvoid repeating facts." : "")
      );
      
      if (!fact) continue;

      const factKey = hashString(fact.substring(0, 50));
      if (!usedFactsCache.has(factKey)) {
        usedFactsCache.set(factKey, true);
        return fact;
      }
    } catch (error) {
      console.warn(`Attempt ${attempt + 1} failed:`, error);
    }
  }

  console.warn(`Failed after ${MAX_ATTEMPTS} attempts`);
  return DEFAULT_FACTS[Math.floor(Math.random() * DEFAULT_FACTS.length)];
}

// Добавляем в начало файла
const usedWordsCache = new Set();
const MAX_CACHE_SIZE = 100; // Храним 100 последних слов

export async function wordOfTheDay() {
  const prompt = `Generate a unique B1-level English word that hasn't been used recently with:
  - The word
  - Russian translation
  - Example sentence
  - Interesting fact about the word
  - Common mistakes with this word
  Return as JSON: {word, translation, example, fact, mistakes}`;
  
  let attempts = 0;
  const maxAttempts = 5;
  let result = null;

  while (attempts < maxAttempts) {
    result = await generateEnglishContent(prompt, 'json');
    
    // Если не удалось сгенерировать слово, используем дефолтное
    if (!result || !result.word) {
      return getDefaultWord();
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
      
      return result;
    }
    
    attempts++;
  }
  
  // Если после нескольких попыток всё равно получаем повтор
  console.warn(`Не удалось сгенерировать уникальное слово после ${maxAttempts} попыток`);
  return getDefaultWord();
}

function getDefaultWord() {
  const defaultWords = [
  
    {
      word: "ephemeral",
      translation: "недолговечный",
      example: "The beauty of cherry blossoms is ephemeral.",
      fact: "From Greek 'ephemeros' meaning 'lasting only one day'",
      mistakes: "Don't confuse with 'eternal' - they're opposites"
    },
    {
      word: "quintessential",
      translation: "наиболее типичный",
      example: "He's the quintessential English gentleman.",
      fact: "Comes from 'quintessence' - the fifth element in ancient philosophy",
      mistakes: "Often misspelled as 'quintessential' (missing the 'e')"
    }
  ];
  
  // Ищем дефолтное слово, которое ещё не использовалось
  for (const word of defaultWords) {
    if (!usedWordsCache.has(word.word.toLowerCase())) {
      usedWordsCache.add(word.word.toLowerCase());
      return word;
    }
  }
  
  // Если все дефолтные слова уже использовались, возвращаем первое
  return defaultWords[0];
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