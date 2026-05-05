import { OpenAI } from 'openai';
import { routerAgent } from '../agents/routerAgent.js';
import { correctorAgent } from '../agents/correctorAgent.js';
import { teacherAgent } from '../agents/teacherAgent.js';
import { exerciseAgent } from '../agents/exerciseAgent.js';
import { progressAgent } from '../agents/progressAgent.js';

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

function formatExercises(exerciseResult) {
  const header = exerciseResult?.task ? `${exerciseResult.task}\n` : '';
  const exercises = Array.isArray(exerciseResult?.exercises)
    ? exerciseResult.exercises.slice(0, 1)
    : [];

  if (exercises.length === 0) {
    return `${header}1. Write one more sentence on this topic.`;
  }

  return [
    header.trim(),
    ...exercises.map((exercise, index) => {
      return [
        `${index + 1}. ${exercise.question}`,
        `Answer: ${exercise.answer}`,
        `Пояснение: ${exercise.explanation}`,
      ].join('\n');
    }),
  ]
    .filter(Boolean)
    .join('\n\n');
}

function formatTeacherReply(result) {
  const examples = Array.isArray(result?.examples) ? result.examples : [];
  const exampleText = examples.length
    ? examples
        .map((example, index) => `${index + 1}. ${example.en}\n${example.ru}`)
        .join('\n\n')
    : '1. I study English every day.\nЯ изучаю английский каждый день.';

  return [
    `📘 Topic: ${result.topic}`,
    '',
    result.explanation,
    '',
    'Examples:',
    exampleText,
  ].join('\n');
}

async function generateFreeChatReply({ userId, message, openai }) {
  const client = getOpenAIClient(openai);

  const response = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.7,
    max_tokens: 220,
    messages: [
      {
        role: 'system',
        content: [
          'You are a friendly English tutor inside a Telegram bot.',
          'Reply in a warm, concise, Telegram-friendly style.',
          'If the user makes small English mistakes, gently model better English without being harsh.',
          'You may use simple Russian when it helps understanding.',
          'End with one short follow-up question when appropriate.',
        ].join(' '),
      },
      {
        role: 'user',
        content: `userId: ${userId ?? 'unknown'}\nmessage: ${String(message || '').trim()}`,
      },
    ],
  });

  return response.choices[0]?.message?.content?.trim() || 'Hi! Let’s practice English together. What would you like to talk about?';
}

/**
 * Integration example for the current bot:
 *
 * import { handleUserMessageWithAgents } from './src/services/agentOrchestrator.js';
 *
 * const response = await handleUserMessageWithAgents({
 *   userId: msg.from.id,
 *   message: msg.text,
 *   openai,
 * });
 *
 * await bot.sendMessage(msg.chat.id, response);
 *
 * Suggested place:
 * inside botSetup.js -> setupMessageHandler() near the current handleRegularMessage(...) call.
 */
export async function handleUserMessageWithAgents({ userId, message, openai } = {}) {
  const safeMessage = String(message || '').trim();

  if (!safeMessage) {
    return '⚠️ Please send a text message.';
  }

  try {
    const routing = await routerAgent.run({
      userId,
      message: safeMessage,
      openai,
    });

    if (routing.route === 'correction') {
      const correction = await correctorAgent.run({
        userId,
        message: safeMessage,
        openai,
      });

      await progressAgent.saveMistake({
        userId,
        topic: correction.errorTopic,
        message: safeMessage,
        correctedText: correction.correctedText,
        userLevel: correction.userLevel,
      });

      const practice = await exerciseAgent.run({
        userId,
        topic: correction.errorTopic,
        userLevel: correction.userLevel,
        openai,
      });

      return [
        '✅ Correct:',
        correction.correctedText,
        '',
        '🧠 Explanation:',
        correction.explanation,
        '',
        '🎯 Practice:',
        formatExercises(practice),
        '',
        '💬 Question:',
        correction.question,
      ].join('\n');
    }

    if (routing.route === 'explanation') {
      const explanation = await teacherAgent.run({
        userId,
        message: safeMessage,
        openai,
      });

      return formatTeacherReply(explanation);
    }

    if (routing.route === 'lesson') {
      return '📚 Lesson mode is coming soon.';
    }

    if (routing.route === 'quiz') {
      return '🎯 Quiz mode is coming soon.';
    }

    return await generateFreeChatReply({
      userId,
      message: safeMessage,
      openai,
    });
  } catch (error) {
    console.error('[Agent Orchestrator] Failed to handle user message:', error.message);

    try {
      return await generateFreeChatReply({
        userId,
        message: safeMessage,
        openai,
      });
    } catch (fallbackError) {
      console.error('[Agent Orchestrator] Free chat fallback failed:', fallbackError.message);
      return '⚠️ Sorry, I could not process your message right now. Please try again a bit later.';
    }
  }
}
