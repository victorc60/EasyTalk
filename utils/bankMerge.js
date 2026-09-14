import { normalizedContentText } from '../services/bankContentRules.js';

export function bankEntryKey(item) {
  const value = item.word || item.idiom || item.phrasalVerb || item.verb || item.question || item.claim || item.text || item.id;
  if (!value) throw new Error('Bank entry has no content identity');
  return normalizedContentText(value);
}

// Existing records win, including their IDs, answer options and usage flags.
export function mergeBankEntries(live, incoming) {
  if (!Array.isArray(live) || !Array.isArray(incoming)) throw new Error('Bank must be a JSON array');
  const result = live.map(item => ({ ...item }));
  const seen = new Map();
  for (const item of result) {
    const key = bankEntryKey(item);
    if (item.isUsed || !seen.has(key)) seen.set(key, item);
  }
  for (const item of incoming) {
    const key = bankEntryKey(item);
    if (seen.has(key)) continue;
    const copy = { ...item };
    result.push(copy); seen.set(key, copy);
  }
  // Retain legacy IDs but prevent an unused duplicate of a used entry resurfacing.
  return result.map(item => seen.get(bankEntryKey(item)).isUsed ? { ...item, isUsed: true } : item);
}
