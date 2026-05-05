import { OpenAI } from 'openai';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ALLOWED_ROUTES = new Set([
  'correction',
  'explanation',
  'lesson',
  'quiz',
  'free_chat',
]);

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

function buildHeuristicRoute(message) {
  const text = String(message || '').trim();
  const normalized = text.toLowerCase();
  const looksLikeEnglishSentence = /[a-z]/i.test(text) && text.split(/\s+/).length >= 3;
  const looksLikeConversation = /^(hi|hello|hey|how are|what's up|can you|could you|tell me|let's talk|i want to talk)/i.test(normalized);

  if (/(объясни|explain|что значит|разница между|when do i use|what is the difference)/i.test(normalized)) {
    return {
      route: 'explanation',
      confidence: 0.82,
      reason: 'The user is asking for a grammar or vocabulary explanation.',
    };
  }

  if (/(lesson|урок|topic of the lesson|learn a topic)/i.test(normalized)) {
    return {
      route: 'lesson',
      confidence: 0.8,
      reason: 'The user is asking to start a lesson flow.',
    };
  }

  if (/(quiz|тест|викторина|exercise me|give me a test)/i.test(normalized)) {
    return {
      route: 'quiz',
      confidence: 0.8,
      reason: 'The user is asking for a quiz or test.',
    };
  }

  if (/(исправь|проверь|correct|fix my|check my|grammar)/i.test(normalized)) {
    return {
      route: 'correction',
      confidence: 0.81,
      reason: 'The user explicitly asks for correction.',
    };
  }

  if (looksLikeEnglishSentence && !looksLikeConversation && !text.includes('?')) {
    return {
      route: 'correction',
      confidence: 0.74,
      reason: 'The message looks like an English sentence that may need correction.',
    };
  }

  return {
    route: 'free_chat',
    confidence: 0.62,
    reason: 'The message looks like general conversation.',
  };
}

function normalizeRoute(payload, message) {
  const heuristic = buildHeuristicRoute(message);
  const route = typeof payload?.route === 'string' ? payload.route.trim() : '';
  const normalizedRoute = ALLOWED_ROUTES.has(route) ? route : heuristic.route;
  const confidence = Number(payload?.confidence);
  const safeConfidence = Number.isFinite(confidence)
    ? Math.max(0, Math.min(1, confidence))
    : heuristic.confidence;
  const reason = typeof payload?.reason === 'string' && payload.reason.trim()
    ? payload.reason.trim()
    : heuristic.reason;

  return {
    route: normalizedRoute,
    confidence: safeConfidence,
    reason,
  };
}

export const routerAgent = {
  name: 'Router Agent',

  async run({ userId, message, openai } = {}) {
    const client = getOpenAIClient(openai);
    const safeMessage = String(message || '').trim();

    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 160,
        messages: [
          {
            role: 'system',
            content: [
              'You are Router Agent for an English-learning Telegram bot.',
              'Classify the user message into exactly one route:',
              'correction, explanation, lesson, quiz, free_chat.',
              'Return only valid JSON with this shape:',
              '{"route":"correction","confidence":0.9,"reason":"..."}',
              'Use correction when the user sends an English sentence for review.',
              'Use explanation when the user asks to explain grammar or vocabulary.',
              'Use lesson when the user asks to start a lesson.',
              'Use quiz when the user asks for a test or quiz.',
              'Use free_chat for normal conversation.',
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
      return normalizeRoute(parsed, safeMessage);
    } catch (error) {
      console.error('[Router Agent] Failed to classify message:', error.message);
      return buildHeuristicRoute(safeMessage);
    }
  },
};
