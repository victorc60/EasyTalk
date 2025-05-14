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
  const prompt = `Generate an interesting English language fact with Russian translation that hasn't been used recently. Include:
  - The fact in English
  - Translation in Russian
  - Brief explanation (1 sentence)
  Format:
  🇬🇧 [fact]
  🇷🇺 [translation]
  💡 [explanation]`;
  
  let attempts = 0;
  const maxAttempts = 5;
  let fact = null;

  while (attempts < maxAttempts) {
    fact = await generateEnglishContent(prompt);
    
    // Если не удалось сгенерировать факт, возвращаем дефолтный
    if (!fact) {
      const defaultFact = `🇬🇧 "Goodbye" comes from "God be with ye"\n🇷🇺 "Goodbye" происходит от "God be with ye"\n💡 Старое английское выражение, сократившееся со временем`;
      return defaultFact;
    }
    
    // Проверяем, не использовался ли этот факт ранее
    const factKey = fact.substring(0, 100); // Берем начало для идентификации
    if (!usedFactsCache.has(factKey)) {
      usedFactsCache.add(factKey);
      
      // Ограничиваем размер кэша (например, храним 30 последних фактов)
      if (usedFactsCache.size > 30) {
        const oldest = usedFactsCache.values().next().value;
        usedFactsCache.delete(oldest);
      }
      
      return fact;
    }
    
    attempts++;
  }
  
  // Если после нескольких попыток все равно получаем повтор, возвращаем дефолтный
  console.warn(`Не удалось сгенерировать уникальный факт после ${maxAttempts} попыток`);
  const defaultFact = `🇬🇧 "Goodbye" comes from "God be with ye"\n🇷🇺 "Goodbye" происходит от "God be with ye"\n💡 Старое английское выражение, сократившееся со временем`;
  return defaultFact;
}

export async function wordOfTheDay() {
  const prompt = `Generate a B1-level English word with:
  - The word
  - Russian translation
  - Example sentence
  - Interesting fact about the word
  - Common mistakes with this word
  Return as JSON: {word, translation, example, fact, mistakes}`;
  
  const result = await generateEnglishContent(prompt, 'json');
  
  return result || {
    word: "serendipity",
    translation: "счастливая случайность",
    example: "Finding this cafe was pure serendipity.",
    fact: "Comes from Persian fairy tale 'The Three Princes of Serendip'",
    mistakes: "Often confused with 'luck' - but implies unexpected discovery"
  };
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