import { OpenAI } from 'openai';

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

function normalizeExamples(examples) {
  if (!Array.isArray(examples) || examples.length === 0) {
    return [
      {
        en: 'I go to work every day.',
        ru: 'Я хожу на работу каждый день.',
      },
      {
        en: 'She does not like coffee.',
        ru: 'Она не любит кофе.',
      },
    ];
  }

  return examples
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      en: typeof item.en === 'string' && item.en.trim() ? item.en.trim() : 'Example in English.',
      ru: typeof item.ru === 'string' && item.ru.trim() ? item.ru.trim() : 'Пример на русском.',
    }))
    .slice(0, 3);
}

function normalizeResult(payload, topic, message) {
  return {
    topic:
      typeof payload?.topic === 'string' && payload.topic.trim()
        ? payload.topic.trim()
        : topic || String(message || '').trim() || 'English grammar',
    explanation:
      typeof payload?.explanation === 'string' && payload.explanation.trim()
        ? payload.explanation.trim()
        : 'Это базовая грамматическая тема. Смотри на форму глагола, порядок слов и маленькие сигналы времени в предложении.',
    examples: normalizeExamples(payload?.examples),
  };
}

export const teacherAgent = {
  name: 'Teacher Agent',

  async run({ userId, message, topic, openai } = {}) {
    const client = getOpenAIClient(openai);
    const safeTopic = topic || '';
    const safeMessage = String(message || '').trim();

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
              'You are Teacher Agent for an English-learning Telegram bot.',
              'Explain grammar or vocabulary simply for a Russian-speaking learner.',
              'Return only valid JSON with this shape:',
              '{"topic":"...","explanation":"...","examples":[{"en":"...","ru":"..."}]}',
              'Rules:',
              '- explanation must be in simple Russian.',
              '- examples must be short and clear.',
              '- keep it concise and friendly.',
              '- provide 2 or 3 examples.',
            ].join(' '),
          },
          {
            role: 'user',
            content: `userId: ${userId ?? 'unknown'}\ntopic: ${safeTopic}\nmessage: ${safeMessage}`,
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      const parsed = parseJson(content);
      return normalizeResult(parsed, safeTopic, safeMessage);
    } catch (error) {
      console.error('[Teacher Agent] Failed to explain topic:', error.message);
      return normalizeResult(null, safeTopic, safeMessage);
    }
  },
};

