import { createHash } from 'node:crypto';

export const CONTENT_FIELDS = { word: 'word', idiom: 'idiom', phrasal_verb: 'phrasalVerb', quiz: 'question', fact: 'claim', mini_event: 'question' };
const ALLOWED_FIELDS = {
  word: ['word', 'translation', 'example', 'hint', 'partOfSpeech'],
  idiom: ['idiom', 'translation', 'meaning', 'example', 'hint'],
  phrasal_verb: ['phrasalVerb', 'translation', 'meaning', 'example', 'hint'],
  quiz: ['question', 'options', 'correctIndex', 'explanation'],
  mini_event: ['question', 'options', 'correctIndex', 'explanation', 'type'],
  fact: ['claim', 'claimRu', 'isTrue', 'explanation'],
};

export function normalizedContentText(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function contentFingerprint(bank, item) {
  return createHash('sha256').update(`${bank}:${normalizedContentText(item[CONTENT_FIELDS[bank]])}`).digest('hex');
}

function text(value, maximum = 500) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum && !/[<>\u0000-\u0008]/.test(value);
}

export function validateBankItem(bank, item, { legacy = false } = {}) {
  if (!item || typeof item !== 'object' || !CONTENT_FIELDS[bank]) return false;
  if (!text(item[CONTENT_FIELDS[bank]], ['word', 'idiom', 'phrasal_verb'].includes(bank) ? 150 : 500)) return false;
  if (!legacy && (!['A1', 'A2', 'B1', 'B2'].includes(item.level) || !text(item.topic, 64))) return false;
  if (['word', 'idiom', 'phrasal_verb'].includes(bank)) {
    return text(item.translation, 150) && text(item.example) && text(item.hint, 190);
  }
  if (bank === 'fact') return typeof item.isTrue === 'boolean' && text(item.claimRu) && text(item.explanation, 1000);
  return Array.isArray(item.options) && item.options.length === 4 &&
    item.options.every(option => text(option, 150)) &&
    new Set(item.options.map(normalizedContentText)).size === 4 &&
    Number.isInteger(item.correctIndex) && item.correctIndex >= 0 && item.correctIndex < 4 && text(item.explanation, 1000);
}

export function acceptedCandidates(bank, items, existing, limit) {
  const seen = new Set(existing.map(item => contentFingerprint(bank, item)));
  const accepted = [];
  for (const item of items.slice(0, limit)) {
    if (!validateBankItem(bank, item)) continue;
    const fingerprint = contentFingerprint(bank, item);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const clean = Object.fromEntries([...ALLOWED_FIELDS[bank], 'level', 'topic'].filter(key => item[key] !== undefined).map(key => [key, item[key]]));
    accepted.push({ ...clean, id: `auto_${fingerprint.slice(0, 32)}`, isUsed: false });
  }
  return accepted;
}

export function nextSaturday(now = new Date()) {
  const date = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
  const calendar = new Date(`${date}T12:00:00Z`);
  calendar.setUTCDate(calendar.getUTCDate() + (6 - calendar.getUTCDay() + 7) % 7);
  return calendar.toISOString().slice(0, 10);
}

export function selectEventQuestions(bank, history, size = 10) {
  const lastUsed = new Map();
  for (const day of history) for (const id of day.question_ids || []) {
    lastUsed.set(String(id), [lastUsed.get(String(id)) || '', day.event_date].sort().at(-1));
  }
  const usedText = new Set(history.flatMap(day => day.questions || []).map(item => contentFingerprint('mini_event', item)));
  for (const item of bank) if (lastUsed.has(String(item.id)) || item.isUsed) usedText.add(contentFingerprint('mini_event', item));
  const seenIds = new Set();
  const seenText = new Set();
  const candidates = bank.filter(item => {
    const fingerprint = contentFingerprint('mini_event', item);
    if (lastUsed.has(String(item.id)) || usedText.has(fingerprint) || !item.id || !validateBankItem('mini_event', item, { legacy: true }) || seenIds.has(String(item.id)) || seenText.has(fingerprint)) return false;
    seenIds.add(String(item.id)); seenText.add(fingerprint); return true;
  }).sort((left, right) => (lastUsed.get(String(left.id)) || '').localeCompare(lastUsed.get(String(right.id)) || '') || String(left.id).localeCompare(String(right.id)));
  if (candidates.length < size) throw new Error('Not enough unused mini-event questions; refill required');
  const questions = candidates.slice(0, size);
  return { questions, reserve: candidates.slice(size, size * 2), repeated: questions.filter(item => lastUsed.has(String(item.id))).length };
}
