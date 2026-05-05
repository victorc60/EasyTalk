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

function normalizeResult(payload, originalMessage) {
  const safeOriginalMessage = String(originalMessage || '').trim();

  return {
    correctedText:
      typeof payload?.correctedText === 'string' && payload.correctedText.trim()
        ? payload.correctedText.trim()
        : safeOriginalMessage,
    explanation:
      typeof payload?.explanation === 'string' && payload.explanation.trim()
        ? payload.explanation.trim()
        : 'Я исправил фразу и сохранил смысл. Попробуй обратить внимание на порядок слов и форму глагола.',
    errorTopic:
      typeof payload?.errorTopic === 'string' && payload.errorTopic.trim()
        ? payload.errorTopic.trim()
        : 'General grammar',
    userLevel:
      typeof payload?.userLevel === 'string' && payload.userLevel.trim()
        ? payload.userLevel.trim().toUpperCase()
        : 'A1',
    question:
      typeof payload?.question === 'string' && payload.question.trim()
        ? payload.question.trim()
        : 'Can you write one more sentence using the same grammar?',
  };
}

export const correctorAgent = {
  name: 'Corrector Agent',

  async run({ userId, message, openai } = {}) {
    const client = getOpenAIClient(openai);
    const safeMessage = String(message || '').trim();

    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 320,
        messages: [
          {
            role: 'system',
            content: [
              'You are Corrector Agent for an English-learning Telegram bot.',
              'Correct the full user sentence and explain the mistake simply.',
              'Return only valid JSON with this shape:',
              '{"correctedText":"...","explanation":"...","errorTopic":"Present Simple","userLevel":"A1","question":"..."}',
              'Rules:',
              '- correctedText must be the final natural English version of the whole sentence.',
              '- fix grammar, word choice, collocations, articles, prepositions, capitalization, punctuation, and unnatural phrasing.',
              '- do not stop after fixing only one mistake if the sentence still sounds wrong.',
              '- for daily routines prefer natural phrasing like "every day" instead of unnatural options like "any day" when needed.',
              '- explanation must be in simple Russian.',
              '- question must be in English.',
              '- keep output concise and suitable for Telegram.',
              '- preserve the user meaning.',
              '- errorTopic should be short.',
              '- userLevel should be one of A1, A2, B1, B2, C1.',
            ].join(' '),
          },
          {
            role: 'user',
            content: `userId: ${userId ?? 'unknown'}\nmessage: ${safeMessage}`,
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      const parsed = parseJson(content);
      return normalizeResult(parsed, safeMessage);
    } catch (error) {
      console.error('[Corrector Agent] Failed to correct message:', error.message);
      return normalizeResult(null, safeMessage);
    }
  },
};
