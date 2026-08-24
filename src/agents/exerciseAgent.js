import { OpenAI } from 'openai';
import { getNativeLanguageInstruction, normalizeNativeLanguage } from '../../utils/nativeLanguage.js';
import { getLanguageConfig } from '../../services/languageRegistry.js';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const fallbackOpenAI = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function getOpenAIClient(openai) {
  const client = openai || fallbackOpenAI;

  if (!client) {
    throw new Error('OpenAI client is not configured. Pass openai or set OPENAI_API_KEY.');
  }

  return client;
}

function parseJson(content) {
  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeExercises(exercises, topic, nativeLanguage) {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return [
      {
        question: `Make one short sentence with ${topic || 'this grammar topic'}.`,
        answer: 'Any correct short sentence is fine.',
        explanation: normalizeNativeLanguage(nativeLanguage) === 'ro'
          ? 'Important este sa folosesti forma corecta a verbului.'
          : 'Главное использовать правильную форму глагола.',
      },
    ];
  }

  return exercises
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      question:
        typeof item.question === 'string' && item.question.trim()
          ? item.question.trim()
          : 'Write a short sentence.',
      answer:
        typeof item.answer === 'string' && item.answer.trim()
          ? item.answer.trim()
          : 'Sample answer.',
      explanation:
        typeof item.explanation === 'string' && item.explanation.trim()
          ? item.explanation.trim()
          : normalizeNativeLanguage(nativeLanguage) === 'ro'
            ? 'Explicatie scurta.'
            : 'Короткое объяснение.',
    }))
    .slice(0, 1);
}

function normalizeResult(payload, topic, nativeLanguage) {
  return {
    topic:
      typeof payload?.topic === 'string' && payload.topic.trim()
        ? payload.topic.trim()
        : topic || 'General grammar',
    task:
      typeof payload?.task === 'string' && payload.task.trim()
        ? payload.task.trim()
        : 'Complete this short practice task.',
    exercises: normalizeExercises(payload?.exercises, topic, nativeLanguage).slice(0, 1),
  };
}

export const exerciseAgent = {
  name: 'Exercise Agent',

  async run({ userId, topic, userLevel, openai, nativeLanguage, targetLanguage = 'en' } = {}) {
    const client = getOpenAIClient(openai);
    const safeTopic = topic || 'General grammar';
    const safeUserLevel = userLevel || 'A1';
    const explanationLanguage = getNativeLanguageInstruction(nativeLanguage);
    const targetConfig = getLanguageConfig(targetLanguage);
    const targetLanguageName = targetConfig?.ai?.languageName || 'target language';

    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content: [
              'You are Exercise Agent for a language-learning Telegram bot.',
              `Create exactly 1 short exercise in ${targetLanguageName} based on the topic and level.`,
              'Return only valid JSON with this shape:',
              '{"topic":"...","task":"...","exercises":[{"question":"...","answer":"...","explanation":"..."}]}',
              'Rules:',
              '- return exactly one exercise in the exercises array.',
              '- keep the exercise short and clear.',
              '- answer should be concise.',
              `- explanation should be simple ${explanationLanguage}.`,
              '- output must fit Telegram.',
            ].join(' '),
          },
          {
            role: 'user',
            content: `userId: ${userId ?? 'unknown'}\ntargetLanguage: ${targetLanguageName}\ntopic: ${safeTopic}\nuserLevel: ${safeUserLevel}`,
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      const parsed = parseJson(content);
      return normalizeResult(parsed, safeTopic, nativeLanguage);
    } catch (error) {
      console.error('[Exercise Agent] Failed to generate exercises:', error.message);
      return normalizeResult(null, safeTopic, nativeLanguage);
    }
  },
};
