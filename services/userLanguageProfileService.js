import { Op } from 'sequelize';
import User from '../models/User.js';
import UserLanguageProfile from '../models/UserLanguageProfile.js';
import UserLearningItem from '../models/UserLearningItem.js';
import MistakeMemory from '../models/MistakeMemory.js';
import { UNKNOWN_LEVEL, getLanguageLabel, normalizeLevel, normalizeTargetLanguage } from './languageRegistry.js';

async function ensureUserRecord(userId) {
  const user = await User.findOne({ where: { telegram_id: userId } });
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }
  return user;
}

export async function ensureUserLanguageProfile({
  userId,
  targetLanguage,
  currentLevel = UNKNOWN_LEVEL,
} = {}) {
  const normalizedLanguage = normalizeTargetLanguage(targetLanguage);
  if (!normalizedLanguage) {
    throw new Error('Unsupported target language');
  }

  await ensureUserRecord(userId);

  const [profile] = await UserLanguageProfile.findOrCreate({
    where: {
      user_id: userId,
      target_language: normalizedLanguage,
    },
    defaults: {
      user_id: userId,
      target_language: normalizedLanguage,
      current_level: normalizeLevel(currentLevel),
      started_at: new Date(),
      last_activity: new Date(),
      onboarding_completed_at: normalizeLevel(currentLevel) === UNKNOWN_LEVEL ? null : new Date(),
    },
  });

  return profile;
}

export async function setUserActiveTargetLanguage({ userId, targetLanguage } = {}) {
  const normalizedLanguage = normalizeTargetLanguage(targetLanguage);
  if (!normalizedLanguage) {
    throw new Error('Unsupported target language');
  }

  await ensureUserRecord(userId);
  await ensureUserLanguageProfile({ userId, targetLanguage: normalizedLanguage });
  await User.update(
    { active_target_language: normalizedLanguage, last_activity: new Date() },
    { where: { telegram_id: userId } }
  );

  return normalizedLanguage;
}

export async function updateUserLanguageLevel({
  userId,
  targetLanguage,
  currentLevel,
} = {}) {
  const normalizedLanguage = normalizeTargetLanguage(targetLanguage);
  const normalizedLevel = normalizeLevel(currentLevel);

  const profile = await ensureUserLanguageProfile({
    userId,
    targetLanguage: normalizedLanguage,
    currentLevel: normalizedLevel,
  });

  await profile.update({
    current_level: normalizedLevel,
    last_activity: new Date(),
    onboarding_completed_at: new Date(),
  });

  return profile;
}

export async function getUserActiveTargetLanguage(userId) {
  const user = await User.findOne({
    where: { telegram_id: userId },
    attributes: ['active_target_language'],
  });

  const normalized = normalizeTargetLanguage(user?.active_target_language);
  if (normalized) {
    return normalized;
  }

  const profile = await UserLanguageProfile.findOne({
    where: { user_id: userId },
    order: [['last_activity', 'DESC'], ['started_at', 'ASC']],
  });

  return normalizeTargetLanguage(profile?.target_language);
}

export async function getUserLanguageProfiles(userId) {
  const profiles = await UserLanguageProfile.findAll({
    where: { user_id: userId },
    order: [['started_at', 'ASC']],
  });

  return Promise.all(profiles.map(async (profile) => {
    const [masteredItems, learnedItems, dueForReview, weakItems, mistakeCount] = await Promise.all([
      UserLearningItem.count({
        where: {
          user_id: userId,
          target_language: profile.target_language,
          state: 'mastered',
        },
      }),
      UserLearningItem.count({
        where: {
          user_id: userId,
          target_language: profile.target_language,
          attempts: { [Op.gt]: 0 },
        },
      }),
      UserLearningItem.count({
        where: {
          user_id: userId,
          target_language: profile.target_language,
          next_review_at: { [Op.lte]: new Date() },
        },
      }),
      UserLearningItem.count({
        where: {
          user_id: userId,
          target_language: profile.target_language,
          state: { [Op.in]: ['weak', 'learning'] },
        },
      }),
      MistakeMemory.count({
        where: {
          user_id: userId,
          target_language: profile.target_language,
        },
      }),
    ]);

    return {
      profile,
      masteredItems,
      learnedItems,
      dueForReview,
      weakItems,
      mistakeCount,
      label: getLanguageLabel(profile.target_language),
    };
  }));
}

export async function getUserLanguageProgressSummary(userId, targetLanguage) {
  const normalizedLanguage = normalizeTargetLanguage(targetLanguage);
  const profile = await ensureUserLanguageProfile({
    userId,
    targetLanguage: normalizedLanguage,
  });

  const [itemsLearned, itemsMastered, dueForReview, weakItems, topMistakes] = await Promise.all([
    UserLearningItem.count({
      where: {
        user_id: userId,
        target_language: normalizedLanguage,
        attempts: { [Op.gt]: 0 },
      },
    }),
    UserLearningItem.count({
      where: {
        user_id: userId,
        target_language: normalizedLanguage,
        state: 'mastered',
      },
    }),
    UserLearningItem.count({
      where: {
        user_id: userId,
        target_language: normalizedLanguage,
        next_review_at: { [Op.lte]: new Date() },
      },
    }),
    UserLearningItem.count({
      where: {
        user_id: userId,
        target_language: normalizedLanguage,
        state: { [Op.in]: ['weak', 'learning'] },
      },
    }),
    MistakeMemory.findAll({
      where: {
        user_id: userId,
        target_language: normalizedLanguage,
      },
      order: [['count', 'DESC'], ['last_seen_at', 'DESC']],
      limit: 3,
      attributes: ['category', 'pattern_key', 'count'],
      raw: true,
    }),
  ]);

  return {
    profile,
    itemsLearned,
    itemsMastered,
    activeVocabulary: itemsLearned,
    dueForReview,
    weakItems,
    topMistakes,
  };
}
