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

function normalizeExamples(examples, nativeLanguage, targetLanguage) {
  const fallbackNativeLanguage = normalizeNativeLanguage(nativeLanguage);
  const targetConfig = getLanguageConfig(targetLanguage);
  const fallbackTargetLanguage = targetConfig?.ai?.languageName || 'target language';
  if (!Array.isArray(examples) || examples.length === 0) {
    return [
      {
        targetText: fallbackTargetLanguage === 'Italian' ? 'Vado al lavoro ogni giorno.' : 'Ich gehe jeden Tag zur Arbeit.',
        nativeText: fallbackNativeLanguage === 'ro' ? 'Eu merg la serviciu in fiecare zi.' : 'Я хожу на работу каждый день.',
      },
      {
        targetText: fallbackTargetLanguage === 'Italian' ? 'A lei non piace il caffe.' : 'Sie mag keinen Kaffee.',
        nativeText: fallbackNativeLanguage === 'ro' ? 'Ei nu ii place cafeaua.' : 'Она не любит кофе.',
      },
    ];
  }

  return examples
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      targetText:
        typeof item.targetText === 'string' && item.targetText.trim()
          ? item.targetText.trim()
          : typeof item.en === 'string' && item.en.trim()
            ? item.en.trim()
            : 'Example in the target language.',
      nativeText:
        typeof item.nativeText === 'string' && item.nativeText.trim()
          ? item.nativeText.trim()
          : typeof item.native === 'string' && item.native.trim()
            ? item.native.trim()
            : typeof item.ru === 'string' && item.ru.trim()
              ? item.ru.trim()
              : 'Пример на родном языке.',
    }))
    .slice(0, 3);
}

function normalizeResult(payload, topic, message, nativeLanguage, targetLanguage) {
  return {
    topic:
      typeof payload?.topic === 'string' && payload.topic.trim()
        ? payload.topic.trim()
        : topic || String(message || '').trim() || 'Language topic',
    explanation:
      typeof payload?.explanation === 'string' && payload.explanation.trim()
        ? payload.explanation.trim()
        : normalizeNativeLanguage(nativeLanguage) === 'ro'
          ? 'Aceasta este o tema gramaticala de baza. Uita-te la forma verbului, ordinea cuvintelor si la markerii de timp.'
          : 'Это базовая грамматическая тема. Смотри на форму глагола, порядок слов и маленькие сигналы времени в предложении.',
    examples: normalizeExamples(payload?.examples, nativeLanguage, targetLanguage),
  };
}

export const teacherAgent = {
  name: 'Teacher Agent',

  async run({ userId, message, topic, openai, nativeLanguage, targetLanguage = 'en' } = {}) {
    const client = getOpenAIClient(openai);
    const safeTopic = topic || '';
    const safeMessage = String(message || '').trim();
    const explanationLanguage = getNativeLanguageInstruction(nativeLanguage);
    const targetConfig = getLanguageConfig(targetLanguage);
    const targetLanguageName = targetConfig?.ai?.languageName || 'target language';

    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 420,
        messages: [
          {
            role: 'system',
            content: [
              'You are Teacher Agent for a language-learning Telegram bot.',
              `Explain grammar or vocabulary in ${targetLanguageName} for a learner whose native language is ${explanationLanguage}.`,
              'Return only valid JSON with this shape:',
              '{"topic":"...","explanation":"...","examples":[{"targetText":"...","nativeText":"..."}]}',
              'Rules:',
              `- explanation must be in simple ${explanationLanguage}.`,
              `- examples must be short and clear in ${targetLanguageName}.`,
              `- each example translation must be in ${explanationLanguage}.`,
              '- keep it concise and friendly.',
              '- provide 2 or 3 examples.',
            ].join(' '),
          },
          {
            role: 'user',
            content: `userId: ${userId ?? 'unknown'}\ntargetLanguage: ${targetLanguageName}\ntopic: ${safeTopic}\nmessage: ${safeMessage}`,
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      const parsed = parseJson(content);
      return normalizeResult(parsed, safeTopic, safeMessage, nativeLanguage, targetLanguage);
    } catch (error) {
      console.error('[Teacher Agent] Failed to explain topic:', error.message);
      return normalizeResult(null, safeTopic, safeMessage, nativeLanguage, targetLanguage);
    }
  },
};
