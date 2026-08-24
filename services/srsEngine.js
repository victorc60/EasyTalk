function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function buildNextReviewDate({
  success,
  isProduction,
  masteryScore = 0,
  attempts = 0,
  incorrectAttempts = 0,
  easeFactor = 2.3,
  now = new Date(),
} = {}) {
  const safeMastery = clamp(Number(masteryScore) || 0, 0, 1);
  const safeAttempts = Math.max(0, Number(attempts) || 0);
  const safeIncorrectAttempts = Math.max(0, Number(incorrectAttempts) || 0);
  const safeEaseFactor = clamp(Number(easeFactor) || 2.3, 1.3, 3.0);

  if (!success) {
    const retryHours = isProduction ? 6 : 12;
    return new Date(now.getTime() + retryHours * 60 * 60 * 1000);
  }

  const baseHours = isProduction ? 36 : 24;
  const masteryMultiplier = 1 + safeMastery * 3;
  const repetitionMultiplier = 1 + Math.min(safeAttempts, 8) * 0.3;
  const penaltyMultiplier = Math.max(0.5, 1 - safeIncorrectAttempts * 0.05);
  const easeMultiplier = Math.max(0.8, safeEaseFactor / 2.3);
  const intervalHours = baseHours * masteryMultiplier * repetitionMultiplier * penaltyMultiplier * easeMultiplier;

  return new Date(now.getTime() + intervalHours * 60 * 60 * 1000);
}

export function adjustEaseFactor({ currentEaseFactor = 2.3, success, isProduction } = {}) {
  const base = Number(currentEaseFactor) || 2.3;
  let updated = base;

  if (success) {
    updated += isProduction ? 0.08 : 0.04;
  } else {
    updated -= isProduction ? 0.2 : 0.12;
  }

  return clamp(updated, 1.3, 3.0);
}
