import { OpenAI } from 'openai';
import { getNativeLanguageInstruction } from '../../utils/nativeLanguage.js';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const VALIDATOR_MODEL = process.env.OPENAI_VALIDATOR_MODEL || MODEL;
const ENABLE_NATURALNESS_PASS = process.env.OPENAI_NATURALNESS_PASS !== 'false';

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

function normalizeResult(payload, originalMessage, nativeLanguage) {
  const safeOriginalMessage = String(originalMessage || '').trim();
  const isRomanian = getNativeLanguageInstruction(nativeLanguage) === 'Romanian';

  return {
    correctedText:
      typeof payload?.correctedText === 'string' && payload.correctedText.trim()
        ? payload.correctedText.trim()
        : safeOriginalMessage,
    explanation:
      typeof payload?.explanation === 'string' && payload.explanation.trim()
        ? payload.explanation.trim()
        : isRomanian
          ? 'Am corectat fraza si am pastrat sensul. Uita-te la ordinea cuvintelor si la forma verbului.'
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

function countCorrectionRiskSignals(text) {
  const safeText = String(text || '').trim();
  let score = 0;

  const patterns = [
    /\bthis photos\b/i,
    /\bthese photo\b/i,
    /\b(i|you|we|they)\s+is\b/i,
    /\b(it|he|she)\s+are\b/i,
    /\bi\s+goes\b/i,
    /\bany day\b/i,
    /\bsince\b.*\b(in \d{4}|last|yesterday|ago|when i was)\b/i,
    /\s+[,.!?]/,
  ];

  for (const pattern of patterns) {
    if (pattern.test(safeText)) {
      score += 1;
    }
  }

  if (/\bi\b/.test(safeText) && !/\bI\b/.test(safeText)) {
    score += 1;
  }

  if (/^[a-z]/.test(safeText)) {
    score += 1;
  }

  return score;
}

function shouldRunNaturalnessPass(originalMessage, draftResult) {
  if (!ENABLE_NATURALNESS_PASS) {
    return false;
  }

  const safeOriginal = String(originalMessage || '').trim();
  const correctedText = String(draftResult?.correctedText || '').trim();
  const originalWordCount = safeOriginal ? safeOriginal.split(/\s+/).length : 0;
  const riskSignals = countCorrectionRiskSignals(safeOriginal);
  const suspiciousDraftPatterns = [
    /\bany day\b/i,
    /\bthis photos\b/i,
    /\bthese photo\b/i,
    /\bsince\b.*\b(in \d{4}|last|yesterday|ago|when i was)\b/i,
  ];

  if (!correctedText) {
    return true;
  }

  if (correctedText.toLowerCase() === safeOriginal.toLowerCase()) {
    return true;
  }

  if (suspiciousDraftPatterns.some((pattern) => pattern.test(correctedText))) {
    return true;
  }

  if (originalWordCount <= 8 && riskSignals <= 2) {
    return false;
  }

  if (riskSignals >= 2) {
    return true;
  }

  if (riskSignals >= 1 && originalWordCount >= 10) {
    return true;
  }

  return false;
}

async function refineCorrectionDraft({ client, userId, originalMessage, draftResult, explanationLanguage }) {
  if (!shouldRunNaturalnessPass(originalMessage, draftResult)) {
    return draftResult;
  }

  try {
    const response = await client.chat.completions.create({
      model: VALIDATOR_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 220,
      messages: [
        {
          role: 'system',
          content: [
            'You are Naturalness Validator for an English-learning Telegram bot.',
            'Review the draft correction package and improve it if needed.',
            'Return only valid JSON with this shape:',
            '{"correctedText":"...","explanation":"...","errorTopic":"...","userLevel":"A1","question":"..."}',
            'Rules:',
            '- correctedText must be fully natural, grammatically correct, and concise.',
            '- preserve the original meaning, but fix tense, word choice, collocations, articles, prepositions, and awkward phrasing.',
            `- explanation must be in simple ${explanationLanguage} and must match the final correctedText.`,
            '- errorTopic must match the main final mistake.',
            '- question must be one short English follow-up question.',
            '- keep everything concise and Telegram-friendly.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            `userId: ${userId ?? 'unknown'}`,
            `originalMessage: ${originalMessage}`,
            `draftResult: ${JSON.stringify(draftResult)}`,
          ].join('\n'),
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    const parsed = parseJson(content);
    return normalizeResult(parsed, originalMessage, explanationLanguage === 'Romanian' ? 'ro' : 'ru');
  } catch (error) {
    console.error('[Corrector Agent] Naturalness validation failed:', error.message);
    return draftResult;
  }
}

export const correctorAgent = {
  name: 'Corrector Agent',

  async run({ userId, message, openai, nativeLanguage } = {}) {
    const client = getOpenAIClient(openai);
    const safeMessage = String(message || '').trim();
    const explanationLanguage = getNativeLanguageInstruction(nativeLanguage);

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
              `- explanation must be in simple ${explanationLanguage}.`,
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
      const draftResult = normalizeResult(parsed, safeMessage, nativeLanguage);

      return await refineCorrectionDraft({
        client,
        userId,
        originalMessage: safeMessage,
        draftResult,
        explanationLanguage,
      });
    } catch (error) {
      console.error('[Corrector Agent] Failed to correct message:', error.message);
      return normalizeResult(null, safeMessage, nativeLanguage);
    }
  },
};
