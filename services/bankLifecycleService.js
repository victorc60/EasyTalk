import fs from 'fs';
import path from 'path';
import { sendAdminMessage } from '../utils/botUtils.js';
import { DATA_DIR } from '../utils/projectPaths.js';

const AUDIT_TZ = 'Europe/Chisinau';

const BANK_SPECS = {
  word: {
    key: 'word',
    title: 'Word Bank',
    bankFile: path.join(DATA_DIR, 'word_bank.json'),
    bankSelector: (row) => row?.word,
  },
  idiom: {
    key: 'idiom',
    title: 'Idiom Bank',
    bankFile: path.join(DATA_DIR, 'idiom_bank.json'),
    bankSelector: (row) => row?.idiom,
  },
  phrasal_verb: {
    key: 'phrasal_verb',
    title: 'Phrasal Verb Bank',
    bankFile: path.join(DATA_DIR, 'phrasal_verbs_bank.json'),
    bankSelector: (row) => row?.phrasalVerb,
  },
  quiz: {
    key: 'quiz',
    title: 'Quiz Bank',
    bankFile: path.join(DATA_DIR, 'quiz_bank.json'),
    bankSelector: (row) => row?.question,
  },
  mini_event: {
    key: 'mini_event',
    title: 'Mini Event Bank',
    bankFile: path.join(DATA_DIR, 'mini_event_questions.json'),
    bankSelector: (row) => row?.id,
  },
  fact: {
    key: 'fact',
    title: 'Fact Bank',
    bankFile: path.join(DATA_DIR, 'facts_bank.json'),
    bankSelector: (row) => row?.id,
  }
};

function readJsonArray(filePath, fallback = []) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function getCoverageForBank(bankKey) {
  const spec = BANK_SPECS[bankKey];
  if (!spec) throw new Error(`Неизвестный банк: ${bankKey}`);

  const bankRows = readJsonArray(spec.bankFile);
  const total = bankRows.length;
  const used = bankRows.filter(row => row.isUsed).length;
  const remaining = total - used;

  return {
    bankKey,
    title: spec.title,
    total,
    used,
    remaining,
    exhausted: remaining === 0,
    usageRate: total > 0 ? Math.round((used / total) * 100) : 0
  };
}

function moscowDateTime() {
  return new Date().toLocaleString('ru-RU', { timeZone: AUDIT_TZ });
}

export function getAllBankCoverage() {
  return Object.keys(BANK_SPECS).map((bankKey) => getCoverageForBank(bankKey));
}

/**
 * Marks the given IDs as isUsed:true in the specified bank file.
 * Used by miniEventService to record which questions were used in an event day.
 */
export function appendBankHistoryEntries(bankKey, ids) {
  const spec = BANK_SPECS[bankKey];
  if (!spec || !Array.isArray(ids) || ids.length === 0) return;
  try {
    const items = JSON.parse(fs.readFileSync(spec.bankFile, 'utf8'));
    const idSet = new Set(ids.map(String));
    let changed = false;
    for (const item of items) {
      const itemId = String(item.id ?? spec.bankSelector(item) ?? '');
      if (idSet.has(itemId) && !item.isUsed) {
        item.isUsed = true;
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(spec.bankFile, JSON.stringify(items, null, 2), 'utf8');
    }
  } catch (err) {
    console.error(`appendBankHistoryEntries error for ${bankKey}:`, err.message);
  }
}

export async function runDailyBankAuditAndAutofill(bot) {
  const coverage = getAllBankCoverage();

  const lines = [];
  lines.push(`🧠 Bank audit ${moscowDateTime()} (${AUDIT_TZ})`);
  lines.push('');
  lines.push('Coverage:');

  for (const row of coverage) {
    const warning = row.exhausted ? ' ⚠️ ПУСТ' : row.remaining <= 3 ? ' ⚠️ мало' : '';
    lines.push(`• ${row.title}: ${row.used}/${row.total} (${row.usageRate}%), remaining=${row.remaining}${warning}`);
  }

  if (bot) {
    await sendAdminMessage(bot, lines.join('\n'));
  }

  return { coverage };
}

export { BANK_SPECS };
