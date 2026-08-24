import { Op } from 'sequelize';
import UserLearningItem from '../models/UserLearningItem.js';
import LearningItem from '../models/LearningItem.js';
import { adjustEaseFactor, buildNextReviewDate } from './srsEngine.js';
import { normalizeTargetLanguage } from './languageRegistry.js';

const RECOGNITION_EXERCISES = new Set(['translation_choice']);
const PRODUCTION_EXERCISES = new Set(['translation_to_target', 'use_in_sentence']);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resolveState({ masteryScore, attempts, correctAttempts, incorrectAttempts }) {
  if (masteryScore >= 0.9 && correctAttempts >= 4) {
    return 'mastered';
  }
  if (masteryScore >= 0.72) {
    return 'strong';
  }
  if (masteryScore >= 0.45) {
    return 'reviewing';
  }
  if (attempts >= 2 && incorrectAttempts > correctAttempts) {
    return 'weak';
  }
  if (attempts > 0) {
    return 'learning';
  }
  return 'new';
}

function buildScoreDeltas({ exerciseType, isCorrect }) {
  const isRecognition = RECOGNITION_EXERCISES.has(exerciseType);
  const isProduction = PRODUCTION_EXERCISES.has(exerciseType);

  if (isRecognition) {
    return {
      recognition: isCorrect ? 0.16 : -0.1,
      production: isCorrect ? 0.04 : -0.02,
    };
  }

  if (isProduction) {
    return {
      recognition: isCorrect ? 0.06 : -0.04,
      production: isCorrect ? 0.18 : -0.14,
    };
  }

  return {
    recognition: isCorrect ? 0.08 : -0.06,
    production: isCorrect ? 0.08 : -0.06,
  };
}

export async function getOrCreateUserLearningItem({
  userId,
  targetLanguage,
  learningItemId,
} = {}) {
  const normalizedLanguage = normalizeTargetLanguage(targetLanguage);
  const [userItem] = await UserLearningItem.findOrCreate({
    where: {
      user_id: userId,
      target_language: normalizedLanguage,
      learning_item_id: learningItemId,
    },
    defaults: {
      user_id: userId,
      target_language: normalizedLanguage,
      learning_item_id: learningItemId,
      state: 'new',
      first_seen_at: new Date(),
      next_review_at: new Date(),
    },
  });

  return userItem;
}

export async function applyLearningExerciseResult({
  userId,
  targetLanguage,
  learningItemId,
  exerciseType,
  isCorrect,
} = {}) {
  const userItem = await getOrCreateUserLearningItem({
    userId,
    targetLanguage,
    learningItemId,
  });

  const now = new Date();
  const deltas = buildScoreDeltas({ exerciseType, isCorrect });
  const nextRecognition = clamp((userItem.recognition_score || 0) + deltas.recognition, 0, 1);
  const nextProduction = clamp((userItem.production_score || 0) + deltas.production, 0, 1);
  const nextMastery = clamp((nextRecognition * 0.45) + (nextProduction * 0.55), 0, 1);
  const nextAttempts = (userItem.attempts || 0) + 1;
  const nextCorrectAttempts = (userItem.correct_attempts || 0) + (isCorrect ? 1 : 0);
  const nextIncorrectAttempts = (userItem.incorrect_attempts || 0) + (isCorrect ? 0 : 1);
  const nextEaseFactor = adjustEaseFactor({
    currentEaseFactor: userItem.ease_factor,
    success: isCorrect,
    isProduction: PRODUCTION_EXERCISES.has(exerciseType),
  });
  const nextReviewAt = buildNextReviewDate({
    success: isCorrect,
    isProduction: PRODUCTION_EXERCISES.has(exerciseType),
    masteryScore: nextMastery,
    attempts: nextAttempts,
    incorrectAttempts: nextIncorrectAttempts,
    easeFactor: nextEaseFactor,
    now,
  });
  const nextState = resolveState({
    masteryScore: nextMastery,
    attempts: nextAttempts,
    correctAttempts: nextCorrectAttempts,
    incorrectAttempts: nextIncorrectAttempts,
  });

  await userItem.update({
    state: nextState,
    attempts: nextAttempts,
    correct_attempts: nextCorrectAttempts,
    incorrect_attempts: nextIncorrectAttempts,
    recognition_score: nextRecognition,
    production_score: nextProduction,
    mastery_score: nextMastery,
    last_seen_at: now,
    last_correct_at: isCorrect ? now : userItem.last_correct_at,
    last_incorrect_at: isCorrect ? userItem.last_incorrect_at : now,
    next_review_at: nextReviewAt,
    ease_factor: nextEaseFactor,
    last_exercise_type: exerciseType,
    first_seen_at: userItem.first_seen_at || now,
  });

  return {
    userItem,
    deltas,
    nextReviewAt,
    nextState,
  };
}

export async function getDueLearningItems({
  userId,
  targetLanguage,
  limit = 3,
} = {}) {
  return UserLearningItem.findAll({
    where: {
      user_id: userId,
      target_language: normalizeTargetLanguage(targetLanguage),
      next_review_at: { [Op.lte]: new Date() },
    },
    include: [{
      model: LearningItem,
      as: 'LearningItem',
      required: true,
    }],
    order: [['next_review_at', 'ASC']],
    limit,
  });
}

export async function getWeakLearningItems({
  userId,
  targetLanguage,
  limit = 2,
} = {}) {
  return UserLearningItem.findAll({
    where: {
      user_id: userId,
      target_language: normalizeTargetLanguage(targetLanguage),
      state: { [Op.in]: ['weak', 'learning'] },
    },
    include: [{
      model: LearningItem,
      as: 'LearningItem',
      required: true,
    }],
    order: [['mastery_score', 'ASC'], ['last_seen_at', 'ASC']],
    limit,
  });
}

export async function getNewLearningItems({
  userId,
  targetLanguage,
  currentLevel,
  limit = 3,
  excludeIds = [],
} = {}) {
  const normalizedLanguage = normalizeTargetLanguage(targetLanguage);
  const seenRows = await UserLearningItem.findAll({
    where: {
      user_id: userId,
      target_language: normalizedLanguage,
    },
    attributes: ['learning_item_id'],
    raw: true,
  });

  const excludedItemIds = new Set([
    ...excludeIds,
    ...seenRows.map((row) => row.learning_item_id),
  ]);

  const where = {
    language_code: normalizedLanguage,
    is_active: true,
  };

  if (currentLevel && currentLevel !== 'unknown') {
    where.level = currentLevel;
  }

  if (excludedItemIds.size > 0) {
    where.id = { [Op.notIn]: Array.from(excludedItemIds) };
  }

  return LearningItem.findAll({
    where,
    order: [['difficulty', 'ASC'], ['id', 'ASC']],
    limit,
  });
}
