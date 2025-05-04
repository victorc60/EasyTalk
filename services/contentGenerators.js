import { OpenAI } from 'openai';
import { NodeCache } from 'node-cache';
import logger from '../utils/logger.js';
import constants from '../config/constants.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const contentCache = new NodeCache({ stdTTL: 3600 }); // Кэш на 1 час

// Валидаторы для ответов API
const validators = {
  wordOfTheDay: (data) => {
    const required = ['word', 'translation', 'example', 'fact', 'mistakes'];
    return required.every(field => data[field] && typeof data[field] === 'string');
  },
  character: (data) => {
    const required = ['name', 'description', 'greeting', 'farewell'];
    return required.every(field => data[field]) && 
           Array.isArray(data.traits) && 
           data.traits.length > 0;
  },
  topic: (data) => {
    return data.topic && 
           Array.isArray(data.questions) && 
           data.questions.length === 3 &&
           Array.isArray(data.vocabulary) &&
           data.vocabulary.length === 5 &&
           data.vocabulary.every(item => item.word && item.translation);
  }
};

// Запасные варианты контента
const fallbackContent = {
  dailyFact: `🇬🇧 "Goodbye" comes from "God be with ye"\n🇷🇺 "Goodbye" происходит от "God be with ye"\n💡 Старое английское выражение, сократившееся со временем`,

  wordOfTheDay: {
    word: "serendipity",
    translation: "счастливая случайность",
    example: "Finding this cafe was pure serendipity.",
    fact: "Comes from Persian fairy tale 'The Three Princes of Serendip'",
    mistakes: "Often confused with 'luck' - but implies unexpected discovery"
  },

  character: {
    name: "Sherlock Holmes",
    description: "Famous detective from London",
    greeting: "Elementary, my dear friend. What brings you to Baker Street today?",
    farewell: "The game is afoot! I must go now.",
    traits: ["observant", "logical", "eccentric"]
  },

  topic: {
    topic: "Technology in education",
    questions: [
      "How has technology changed the way we learn?",
      "What are the advantages of online learning?",
      "Can technology replace teachers in the future?"
    ],
    vocabulary: [
      { word: "e-learning", translation: "электронное обучение" },
      { word: "platform", translation: "платформа" },
      { word: "interactive", translation: "интерактивный" },
      { word: "digital literacy", translation: "цифровая грамотность" },
      { word: "remote", translation: "удаленный" }
    ]
  }
};

/**
 * Генерация контента через OpenAI API
 */
async function generateWithAI(prompt, { format = 'text', validator = null, cacheKey = null }) {
  if (cacheKey && contentCache.has(cacheKey)) {
    return contentCache.get(cacheKey);
  }

  try {
    const completion = await openai.chat.completions.create({
      model: constants.GPT_MODEL,
      messages: [{ role: 'system', content: prompt }],
      temperature: 0.8,
      max_tokens: format === 'json' ? 500 : 300,
      response_format: { type: format === 'json' ? 'json_object' : 'text' }
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');

    let result = format === 'json' ? tryParseJson(content) : content;
    if (validator && !validator(result)) throw new Error('Validation failed');

    if (cacheKey) {
      contentCache.set(cacheKey, result);
    }

    return result;
  } catch (error) {
    logger.error(`Content generation failed: ${error.message}`, { prompt });
    return null;
  }
}

function tryParseJson(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}

export const contentGenerators = {
  /**
   * Интересный факт дня
   */
  async dailyFact() {
    const prompt = `Generate an interesting English language fact with Russian translation. Include:
    - The fact in English
    - Translation in Russian
    - Brief explanation (1 sentence)
    Format:
    🇬🇧 [fact]
    🇷🇺 [translation]
    💡 [explanation]`;

    const cacheKey = `fact_${new Date().toISOString().split('T')[0]}`;
    return await generateWithAI(prompt, { cacheKey }) || fallbackContent.dailyFact;
  },

  /**
   * Слово дня с деталями
   */
  async wordOfTheDay() {
    const prompt = `Generate a B1-level English word with:
    - word: the English word
    - translation: Russian translation
    - example: example sentence
    - fact: interesting fact about the word
    - mistakes: common mistakes with this word
    Return as JSON`;

    const cacheKey = `word_${new Date().toISOString().split('T')[0]}`;
    const result = await generateWithAI(prompt, {
      format: 'json',
      validator: validators.wordOfTheDay,
      cacheKey
    });

    return result || fallbackContent.wordOfTheDay;
  },

  /**
   * Случайный персонаж для ролевой игры
   */
  async randomCharacter() {
    const prompt = `Create a character for English practice with:
    - name: character name
    - description: brief description
    - greeting: how character greets users
    - farewell: how character says goodbye
    - traits: array of 3-5 personality traits
    Return as JSON`;

    const result = await generateWithAI(prompt, {
      format: 'json',
      validator: validators.character
    });

    return result || fallbackContent.character;
  },

  /**
   * Тема для обсуждения с вопросами и словарём
   */
  async conversationTopic() {
    const prompt = `Generate a unique conversation topic for English learners (B1 level) with:
    - topic: engaging topic title
    - questions: array of 3 related questions
    - vocabulary: array of exactly 5 words with translations (format: {word: "english", translation: "russian"})
    Return as JSON`;

    const result = await generateWithAI(prompt, {
      format: 'json',
      validator: validators.topic
    });

    return result || fallbackContent.topic;
  },

  /**
   * Генерация упражнения по грамматике
   */
  async grammarExercise(level = 'B1', rule = null) {
    const prompt = rule 
      ? `Create a ${level}-level English grammar exercise about "${rule}" with:
        - instruction: clear instructions
        - sentences: 5 sentences to complete
        - answers: correct answers
        - explanation: brief rule explanation
        Return as JSON`
      : `Create a general ${level}-level English grammar exercise with:
        - instruction: clear instructions
        - sentences: 5 sentences to complete
        - answers: correct answers
        - explanation: brief rule explanation
        - rule: the grammar rule being practiced
        Return as JSON`;

    return await generateWithAI(prompt, { format: 'json' }) || {
      instruction: "Complete the sentences with the correct verb form",
      sentences: [
        "She ___ (to go) to school every day.",
        "They ___ (to watch) TV right now."
      ],
      answers: ["goes", "are watching"],
      explanation: "Present Simple for routines, Present Continuous for current actions"
    };
  }
  
};