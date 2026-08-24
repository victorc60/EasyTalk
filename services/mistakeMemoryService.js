import MistakeMemory from '../models/MistakeMemory.js';
import { buildNextReviewDate } from './srsEngine.js';
import { normalizeTargetLanguage } from './languageRegistry.js';

export async function rememberMistake({
  userId,
  targetLanguage,
  learningItemId = null,
  category = 'grammar',
  patternKey = 'general',
  sourceText = '',
  correctedText = '',
  explanation = '',
  metadata = null,
} = {}) {
  const normalizedLanguage = normalizeTargetLanguage(targetLanguage);
  const [memory, created] = await MistakeMemory.findOrCreate({
    where: {
      user_id: userId,
      target_language: normalizedLanguage,
      category,
      pattern_key: patternKey,
    },
    defaults: {
      user_id: userId,
      target_language: normalizedLanguage,
      learning_item_id: learningItemId,
      category,
      pattern_key: patternKey,
      source_text: sourceText,
      corrected_text: correctedText,
      explanation,
      metadata,
      next_review_at: buildNextReviewDate({
        success: false,
        isProduction: true,
      }),
    },
  });

  if (!created) {
    await memory.update({
      learning_item_id: learningItemId || memory.learning_item_id,
      source_text: sourceText || memory.source_text,
      corrected_text: correctedText || memory.corrected_text,
      explanation: explanation || memory.explanation,
      count: (memory.count || 0) + 1,
      last_seen_at: new Date(),
      next_review_at: buildNextReviewDate({
        success: false,
        isProduction: true,
        attempts: memory.count || 1,
      }),
      metadata: metadata || memory.metadata,
    });
  }

  return memory;
}
