import { OpenAI } from 'openai';
import { Op } from 'sequelize';
import DailySession from '../models/DailySession.js';
import SessionExercise from '../models/SessionExercise.js';
import ExerciseAttempt from '../models/ExerciseAttempt.js';
import LearningItem from '../models/LearningItem.js';
import UserLearningItem from '../models/UserLearningItem.js';
import { getLanguageConfig, getLanguageLabel, normalizeLanguageText, normalizeTargetLanguage } from './languageRegistry.js';
import { getDueLearningItems, getNewLearningItems, getWeakLearningItems, applyLearningExerciseResult } from './userLearningService.js';
import { getUserActiveTargetLanguage, getUserLanguageProgressSummary } from './userLanguageProfileService.js';
import { rememberMistake } from './mistakeMemoryService.js';

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const fallbackOpenAI = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function getOpenAIClient(openai) {
  return openai || fallbackOpenAI || null;
}

function buildChoiceOptions(item, distractors) {
  const options = [item.translation, ...distractors.map((candidate) => candidate.translation)]
    .filter(Boolean)
    .slice(0, 4);
  const uniqueOptions = [...new Set(options)];
  const correctIndex = uniqueOptions.findIndex((option) => option === item.translation);

  return {
    options: uniqueOptions,
    correctIndex: correctIndex >= 0 ? correctIndex : 0,
  };
}

async function getDistractors(item, limit = 3) {
  const rows = await LearningItem.findAll({
    where: {
      language_code: item.language_code,
      id: { [Op.ne]: item.id },
      type: item.type,
    },
    order: [['difficulty', 'ASC'], ['id', 'ASC']],
    limit: Math.max(limit * 2, 6),
  });

  const seen = new Set();
  return rows
    .filter((candidate) => {
      if (!candidate.translation || candidate.translation === item.translation) {
        return false;
      }
      if (seen.has(candidate.translation)) {
        return false;
      }
      seen.add(candidate.translation);
      return true;
    })
    .slice(0, limit);
}

function buildAcceptedAnswers(item) {
  const answers = [item.text, item.base_form];
  const accepted = item.grammar_metadata?.acceptedAnswers;
  if (Array.isArray(accepted)) {
    answers.push(...accepted);
  }
  return [...new Set(answers.filter(Boolean))];
}

function inferMistakeCategory(item, exerciseType) {
  if (exerciseType === 'translation_to_target' || exerciseType === 'use_in_sentence') {
    return item.type === 'grammar' ? 'grammar' : 'expression_usage';
  }
  return 'vocabulary';
}

function buildTextFeedback({ item, isCorrect, correctedText = null }) {
  if (isCorrect) {
    return `✅ ${correctedText || item.text}\n\nGood. Let's continue.`;
  }

  return `✅ ${item.text}\n🇷🇺 ${item.translation}\n\nKeep this item in review.`;
}

async function evaluateSentenceWithAi({
  targetLanguage,
  requiredText,
  userAnswer,
  nativeLanguage,
  openai,
} = {}) {
  const client = getOpenAIClient(openai);
  if (!client) {
    const normalizedRequired = normalizeLanguageText(targetLanguage, requiredText);
    const normalizedAnswer = normalizeLanguageText(targetLanguage, userAnswer);
    const accepted = normalizedAnswer.includes(normalizedRequired) && normalizedAnswer.length > normalizedRequired.length + 2;
    return {
      accepted,
      correctedText: accepted ? userAnswer : requiredText,
      feedback: accepted
        ? 'The phrase is used in your sentence.'
        : 'Use the target phrase directly in your sentence.',
    };
  }

  const config = getLanguageConfig(targetLanguage);
  const response = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: 220,
    messages: [
      {
        role: 'system',
        content: [
          'Evaluate a learner sentence for a language-learning app.',
          `The target language is ${config?.ai?.languageName || targetLanguage}.`,
          `The learner native language is ${nativeLanguage || 'ru'}.`,
          'Check whether the learner used the required target phrase naturally enough.',
          'Return only JSON in this shape:',
          '{"accepted":true,"correctedText":"...","feedback":"..."}',
          'Keep feedback brief.',
        ].join(' '),
      },
      {
        role: 'user',
        content: `Required phrase: ${requiredText}\nLearner sentence: ${userAnswer}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content || '{}';
  let parsed = {};

  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }

  return {
    accepted: Boolean(parsed.accepted),
    correctedText: parsed.correctedText || requiredText,
    feedback: parsed.feedback || 'Try to use the target phrase more naturally.',
  };
}

function buildExerciseRow({ item, exerciseType, stage, sourceKind, prompt, expectedAnswer, position }) {
  return {
    learning_item_id: item.id,
    position,
    stage,
    source_kind: sourceKind,
    exercise_type: exerciseType,
    prompt,
    expected_answer: expectedAnswer,
  };
}

async function buildExercisePlan({ userId, targetLanguage, currentLevel }) {
  const dueRows = await getDueLearningItems({ userId, targetLanguage, limit: 2 });
  const dueItemIds = new Set(dueRows.map((row) => row.learning_item_id));
  const weakRows = (await getWeakLearningItems({ userId, targetLanguage, limit: 4 }))
    .filter((row) => !dueItemIds.has(row.learning_item_id))
    .slice(0, 2);
  const excludedIds = [
    ...dueRows.map((row) => row.learning_item_id),
    ...weakRows.map((row) => row.learning_item_id),
  ];
  const newItems = await getNewLearningItems({
    userId,
    targetLanguage,
    currentLevel,
    limit: 3,
    excludeIds: excludedIds,
  });

  const plan = [];
  const sourceGroups = [
    ...newItems.map((item) => ({ item, sourceKind: 'new' })),
    ...dueRows.map((row) => ({ item: row.LearningItem, sourceKind: 'review' })),
    ...weakRows.map((row) => ({ item: row.LearningItem, sourceKind: 'weak' })),
  ];

  let position = 0;
  for (const entry of sourceGroups) {
    const distractors = await getDistractors(entry.item, 3);
    const choice = buildChoiceOptions(entry.item, distractors);
    plan.push(buildExerciseRow({
      item: entry.item,
      exerciseType: 'translation_choice',
      stage: entry.sourceKind === 'new' ? 'learn' : 'review',
      sourceKind: entry.sourceKind,
      prompt: {
        question: `Choose the right translation for: ${entry.item.text}`,
        options: choice.options,
        hint: entry.item.example || null,
      },
      expectedAnswer: {
        correctIndex: choice.correctIndex,
      },
      position,
    }));
    position += 1;
  }

  const productionCandidates = sourceGroups.slice(0, 2);
  for (const entry of productionCandidates) {
    plan.push(buildExerciseRow({
      item: entry.item,
      exerciseType: 'translation_to_target',
      stage: 'practice',
      sourceKind: entry.sourceKind,
      prompt: {
        question: `Translate into ${getLanguageLabel(targetLanguage)}: ${entry.item.translation}`,
        sourceText: entry.item.translation,
        hint: entry.item.example_translation || null,
      },
      expectedAnswer: {
        acceptedAnswers: buildAcceptedAnswers(entry.item),
      },
      position,
    }));
    position += 1;
  }

  const sentenceCandidate = sourceGroups.find((entry) => entry.item.type !== 'word') || sourceGroups[0];
  if (sentenceCandidate) {
    plan.push(buildExerciseRow({
      item: sentenceCandidate.item,
      exerciseType: 'use_in_sentence',
      stage: 'output',
      sourceKind: sentenceCandidate.sourceKind,
      prompt: {
        question: `Write one short sentence with: ${sentenceCandidate.item.text}`,
        requiredText: sentenceCandidate.item.text,
      },
      expectedAnswer: {
        requiredText: sentenceCandidate.item.text,
      },
      position,
    }));
  }

  return plan;
}

function isTextExercise(exerciseType) {
  return exerciseType === 'translation_to_target' || exerciseType === 'use_in_sentence';
}

export async function startDailySession({ userId, targetLanguage, openai } = {}) {
  const resolvedLanguage = normalizeTargetLanguage(targetLanguage) || await getUserActiveTargetLanguage(userId);
  if (!resolvedLanguage) {
    throw new Error('Target language is not selected');
  }

  const activeExistingSession = await DailySession.findOne({
    where: {
      user_id: userId,
      target_language: resolvedLanguage,
      status: 'active',
    },
    order: [['created_at', 'DESC']],
  });

  if (activeExistingSession) {
    return activeExistingSession;
  }

  const summary = await getUserLanguageProgressSummary(userId, resolvedLanguage);
  const currentLevel = summary.profile.current_level || 'unknown';
  const exercisePlan = await buildExercisePlan({
    userId,
    targetLanguage: resolvedLanguage,
    currentLevel,
    openai,
  });

  if (exercisePlan.length === 0) {
    throw new Error(`No learning content available yet for ${resolvedLanguage}`);
  }

  const session = await DailySession.create({
    user_id: userId,
    target_language: resolvedLanguage,
    current_level: currentLevel,
    status: 'active',
    current_position: 0,
    total_exercises: exercisePlan.length,
    summary: {
      createdFrom: {
        dueForReview: summary.dueForReview,
        weakItems: summary.weakItems,
      },
    },
  });

  await SessionExercise.bulkCreate(exercisePlan.map((exercise) => ({
    daily_session_id: session.id,
    ...exercise,
  })));

  return session;
}

export async function getCurrentSessionExercise(sessionId) {
  const session = await DailySession.findByPk(sessionId);
  if (!session || session.status !== 'active') {
    return null;
  }

  const exercise = await SessionExercise.findOne({
    where: {
      daily_session_id: session.id,
      position: session.current_position,
    },
    include: [{
      model: LearningItem,
      as: 'LearningItem',
      required: false,
    }],
  });

  return exercise;
}

export function formatSessionExerciseMessage(session, exercise) {
  const counter = `${session.current_position + 1}/${session.total_exercises}`;
  const header = `🎯 <b>Daily Session</b> • ${getLanguageLabel(session.target_language)} • ${counter}`;

  if (exercise.exercise_type === 'translation_choice') {
    return {
      text: `${header}\n\n${exercise.prompt.question}${exercise.prompt.hint ? `\n\n💡 ${exercise.prompt.hint}` : ''}`,
      reply_markup: {
        inline_keyboard: exercise.prompt.options.map((option, index) => ([{
          text: option,
          callback_data: `session_answer_${session.id}_${index}`,
        }])),
      },
    };
  }

  if (exercise.exercise_type === 'translation_to_target') {
    return {
      text: `${header}\n\n${exercise.prompt.question}${exercise.prompt.hint ? `\n\n💡 ${exercise.prompt.hint}` : ''}\n\nSend your answer as text.`,
      reply_markup: null,
    };
  }

  return {
    text: `${header}\n\n${exercise.prompt.question}\n\nSend your sentence as text.`,
    reply_markup: null,
  };
}

async function completeSession(session) {
  const attempts = await ExerciseAttempt.findAll({
    include: [{
      model: SessionExercise,
      as: 'SessionExercise',
      where: { daily_session_id: session.id },
      attributes: ['exercise_type'],
    }],
    where: {
      user_id: session.user_id,
    },
  });
  const correct = attempts.filter((attempt) => attempt.is_correct).length;

  await session.update({
    status: 'completed',
    completed_at: new Date(),
    summary: {
      ...(session.summary || {}),
      attempts: attempts.length,
      correct,
      accuracy: attempts.length > 0 ? Math.round((correct / attempts.length) * 100) : 0,
    },
  });

  return session.summary;
}

export async function submitSessionAnswer({
  sessionId,
  userId,
  answer,
  nativeLanguage,
  openai,
} = {}) {
  const session = await DailySession.findByPk(sessionId);
  if (!session || session.status !== 'active') {
    throw new Error('Session is not active');
  }

  const exercise = await getCurrentSessionExercise(session.id);
  if (!exercise) {
    throw new Error('Exercise not found');
  }

  let isCorrect = false;
  let feedback = '';
  let correctedText = null;
  let score = 0;

  if (exercise.exercise_type === 'translation_choice') {
    const selectedIndex = Number(answer);
    isCorrect = selectedIndex === exercise.expected_answer?.correctIndex;
    feedback = isCorrect
      ? `✅ ${exercise.LearningItem.text} = ${exercise.LearningItem.translation}`
      : `✅ ${exercise.LearningItem.text} = ${exercise.LearningItem.translation}\n\nKeep this one for review.`;
    score = isCorrect ? 1 : 0;
  } else if (exercise.exercise_type === 'translation_to_target') {
    const normalizedAnswer = normalizeLanguageText(session.target_language, answer);
    const acceptedAnswers = (exercise.expected_answer?.acceptedAnswers || [])
      .map((item) => normalizeLanguageText(session.target_language, item));
    isCorrect = acceptedAnswers.includes(normalizedAnswer);
    correctedText = exercise.LearningItem.text;
    feedback = buildTextFeedback({ item: exercise.LearningItem, isCorrect, correctedText });
    score = isCorrect ? 1 : 0;
  } else {
    const aiResult = await evaluateSentenceWithAi({
      targetLanguage: session.target_language,
      requiredText: exercise.prompt.requiredText,
      userAnswer: answer,
      nativeLanguage,
      openai,
    });
    isCorrect = aiResult.accepted;
    correctedText = aiResult.correctedText;
    feedback = `${buildTextFeedback({ item: exercise.LearningItem, isCorrect, correctedText })}\n\n${aiResult.feedback}`;
    score = isCorrect ? 1 : 0.5;
  }

  const learningUpdate = await applyLearningExerciseResult({
    userId,
    targetLanguage: session.target_language,
    learningItemId: exercise.learning_item_id,
    exerciseType: exercise.exercise_type,
    isCorrect,
  });

  if (!isCorrect) {
    await rememberMistake({
      userId,
      targetLanguage: session.target_language,
      learningItemId: exercise.learning_item_id,
      category: inferMistakeCategory(exercise.LearningItem, exercise.exercise_type),
      patternKey: `${exercise.exercise_type}:${exercise.LearningItem.text.toLowerCase()}`,
      sourceText: String(answer || ''),
      correctedText: correctedText || exercise.LearningItem.text,
      explanation: feedback,
      metadata: {
        exerciseType: exercise.exercise_type,
      },
    });
  }

  await ExerciseAttempt.create({
    session_exercise_id: exercise.id,
    user_id: userId,
    answer_text: String(answer || ''),
    is_correct: isCorrect,
    score,
    feedback,
    recognition_delta: learningUpdate.deltas.recognition,
    production_delta: learningUpdate.deltas.production,
    metadata: {
      nextState: learningUpdate.nextState,
      nextReviewAt: learningUpdate.nextReviewAt,
    },
  });

  const nextPosition = session.current_position + 1;
  if (nextPosition >= session.total_exercises) {
    await session.update({ current_position: nextPosition });
    const summary = await completeSession(session);
    return {
      finished: true,
      feedback,
      summary,
      session,
    };
  }

  await session.update({ current_position: nextPosition });
  const nextExercise = await getCurrentSessionExercise(session.id);

  return {
    finished: false,
    feedback,
    nextExercise,
    session,
  };
}

export async function getActiveDailySession(userId) {
  return DailySession.findOne({
    where: {
      user_id: userId,
      status: 'active',
    },
    order: [['created_at', 'DESC']],
  });
}

export async function getSessionSummaryMessage(sessionId) {
  const session = await DailySession.findByPk(sessionId);
  if (!session) {
    return 'Session not found.';
  }

  const summary = session.summary || {};
  return [
    `✅ <b>Daily Session Complete</b>`,
    `${getLanguageLabel(session.target_language)} • level ${session.current_level}`,
    '',
    `Exercises: ${summary.attempts || session.total_exercises}`,
    `Correct: ${summary.correct || 0}`,
    `Accuracy: ${summary.accuracy || 0}%`,
  ].join('\n');
}

export { isTextExercise };
