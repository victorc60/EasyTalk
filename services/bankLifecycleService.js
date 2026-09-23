import fs from 'fs';
import path from 'path';
import { sendAdminMessage } from '../utils/botUtils.js';
import { DATA_DIR } from '../utils/projectPaths.js';
import ContentQueue from '../models/ContentQueue.js';
import DailyLog from '../models/DailyLog.js';
import GeneratedBankItem from '../models/GeneratedBankItem.js';
import { maintainBanks, getBankSupply } from './bankAutofillService.js';
import { LEARNING_BANK_SPECS } from './learningBankSupplyService.js';
import { prepareUpcomingMiniEvent } from './miniEventPlanService.js';

const AUDIT_TZ = 'Europe/Chisinau';

const BANK_SPECS = {
  ...LEARNING_BANK_SPECS,
  word: {
    key: 'word',
    queueType: 'word',
    title: 'Word Bank',
    bankFile: path.join(DATA_DIR, 'word_bank.json'),
    bankSelector: (row) => row?.word,
  },
  idiom: {
    key: 'idiom',
    queueType: 'idiom',
    title: 'Idiom Bank',
    bankFile: path.join(DATA_DIR, 'idiom_bank.json'),
    bankSelector: (row) => row?.idiom,
  },
  phrasal_verb: {
    key: 'phrasal_verb',
    queueType: 'phrasal',
    title: 'Phrasal Verb Bank',
    bankFile: path.join(DATA_DIR, 'phrasal_verbs_bank.json'),
    bankSelector: (row) => row?.phrasalVerb,
  },
  quiz: {
    key: 'quiz',
    queueType: 'quiz',
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
    queueType: 'fact',
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

  const bankRows = spec.bankFile ? readJsonArray(spec.bankFile) : [];
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

async function getQueueCoverageForBank(bankKey) {
  const spec = BANK_SPECS[bankKey];
  const source = getCoverageForBank(bankKey);

  if (spec.kind === 'catalog') {
    const supply = await getBankSupply(spec);
    return { ...source, catalog: true, levels: supply.levels, remaining: supply.remaining,
      total: supply.levels.reduce((sum, level) => sum + level.total, 0),
      exhausted: supply.remaining === 0, source, queue: null, today: null };
  }

  if (!spec?.queueType) {
    const generated = await GeneratedBankItem.count({ where: { bank: bankKey } });
    const supply = await getBankSupply(spec);
    return {
      ...source,
      generated,
      remaining: supply.remaining,
      exhausted: supply.remaining === 0,
      source,
      queue: null,
      today: null
    };
  }

  const [total, used, today] = await Promise.all([
    ContentQueue.count({ where: { type: spec.queueType } }),
    ContentQueue.count({ where: { type: spec.queueType, used: true } }),
    DailyLog.findOne({
      where: { type: spec.queueType, date: getTodayDate() },
      attributes: ['content_id']
    })
  ]);
  const remaining = (await getBankSupply(spec)).remaining;

  return {
    ...source,
    total,
    used,
    remaining,
    exhausted: total > 0 && remaining === 0,
    usageRate: total > 0 ? Math.round((used / total) * 100) : 0,
    source,
    queue: {
      type: spec.queueType,
      total,
      used,
      remaining,
      exhausted: total > 0 && remaining === 0,
      usageRate: total > 0 ? Math.round((used / total) * 100) : 0
    },
    today: today?.content_id || null
  };
}

function moscowDateTime() {
  return new Date().toLocaleString('ru-RU', { timeZone: AUDIT_TZ });
}

function getTodayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: AUDIT_TZ });
}

export function getAllBankCoverage() {
  return Object.keys(BANK_SPECS).map((bankKey) => getCoverageForBank(bankKey));
}

export async function getAllBankQueueCoverage() {
  return Promise.all(Object.keys(BANK_SPECS).map((bankKey) => getQueueCoverageForBank(bankKey)));
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

export async function runDailyBankAuditAndAutofill(bot, { generate = true, openai } = {}) {
  const maintenance = generate ? await maintainBanks(BANK_SPECS, { openai }) : [];
  let eventPlan = null;
  if (generate) {
    try { eventPlan = await prepareUpcomingMiniEvent(); }
    catch (error) { eventPlan = { status: 'failed', error: error.message }; }
  }
  const coverage = await getAllBankQueueCoverage();

  const lines = [];
  lines.push(`🧠 Bank audit ${moscowDateTime()} (${AUDIT_TZ})`);
  lines.push('');
  if (generate) {
    lines.push('Autofill:');
    for (const result of maintenance) lines.push(`• ${result.bank || 'all'}: ${result.status}, added=${result.published || 0}`);
    lines.push(`Saturday: ${JSON.stringify(eventPlan)}`);
    lines.push('');
  }
  lines.push('Queue coverage (real daily rotation):');

  for (const row of coverage) {
    if (row.catalog) {
      lines.push(`• ${row.title}: ${row.levels.map(level => `${level.level}: ${level.remaining} new/${level.total} total`).join(', ')}`);
      continue;
    }
    if (!row.queue) {
      const warning = row.exhausted ? ' ⚠️ ПУСТ' : row.remaining <= 3 ? ' ⚠️ мало' : '';
      lines.push(`• ${row.title}: seed=${row.total}, generated=${row.generated || 0}, free=${row.remaining}${warning}`);
      continue;
    }

    const warning = row.queue.total === 0
      ? ' ⚠️ queue empty'
      : row.queue.exhausted
        ? ' ⚠️ cycle exhausted'
        : row.queue.remaining <= 3
          ? ' ⚠️ мало'
          : '';
    const todayInfo = row.today ? `, today=${row.today}` : ', today=not sent';
    const sourceInfo = row.source.total !== row.queue.total
      ? `, source=${row.source.total}`
      : '';

    lines.push(
      `• ${row.title}: queue ${row.queue.used}/${row.queue.total} (${row.queue.usageRate}%), remaining=${row.queue.remaining}${todayInfo}${sourceInfo}${warning}`
    );
  }

  lines.push('');
  lines.push('Legacy JSON isUsed marks:');
  for (const row of coverage) {
    if (row.catalog) continue;
    lines.push(`• ${row.title}: ${row.source.used}/${row.source.total}`);
  }

  if (bot) {
    await sendAdminMessage(bot, lines.join('\n'));
  }

  return { coverage, maintenance, eventPlan };
}

export { BANK_SPECS };
