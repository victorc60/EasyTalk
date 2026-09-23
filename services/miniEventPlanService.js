import fs from 'node:fs';
import { dataFilePath } from '../utils/projectPaths.js';
import MiniEventPlan from '../models/MiniEventPlan.js';
import MiniEventDay from '../models/MiniEventDay.js';
import GeneratedBankItem from '../models/GeneratedBankItem.js';
import { nextSaturday, selectEventQuestions } from './bankContentRules.js';

export function readMiniEventHistory() {
  const historyFile = dataFilePath('mini_event_history.json');
  const history = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, 'utf8')) : [];
  if (!Array.isArray(history)) throw new Error('Invalid mini-event history');
  return history;
}

export async function loadMiniEventBank() {
  const seed = JSON.parse(fs.readFileSync(dataFilePath('mini_event_questions.json'), 'utf8'));
  if (!Array.isArray(seed)) throw new Error('Invalid mini-event seed bank');
  const generated = await GeneratedBankItem.findAll({ where: { bank: 'mini_event' } });
  return [...seed, ...generated.map(row => row.content)];
}

export async function prepareMiniEventPlan(eventDate) {
  const existing = await MiniEventPlan.findByPk(eventDate);
  if (existing) return existing;
  const day = await MiniEventDay.findOne({ where: { event_date: eventDate } });
  const bank = await loadMiniEventBank();
  const history = await MiniEventDay.findAll({ attributes: ['event_date', 'question_ids'] });
  const plans = await MiniEventPlan.findAll();
  history.push(...plans.map(plan => ({ event_date: plan.event_date, question_ids: plan.questions.map(item => item.id), questions: plan.questions })));
  const legacy = readMiniEventHistory();
  history.push({ event_date: '1970-01-01', question_ids: [...legacy, ...bank.filter(item => item.isUsed).map(item => item.id)] });
  let selected;
  if (day) {
    const questions = day.question_ids.map(id => bank.find(item => String(item.id) === String(id)));
    if (questions.some(item => !item)) throw new Error('Existing event content is missing; refusing to replace it');
    selected = { questions, reserve: [], repeated: 0 };
  } else {
    selected = selectEventQuestions(bank, history);
  }
  const [plan] = await MiniEventPlan.findOrCreate({ where: { event_date: eventDate }, defaults: { event_date: eventDate, ...selected } });
  return plan;
}

export async function prepareUpcomingMiniEvent(now = new Date()) {
  const date = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (weekday < 4 || weekday > 6) return { status: 'waiting_until_thursday' };
  const plan = await prepareMiniEventPlan(nextSaturday(now));
  return { status: 'ready', date: plan.event_date, questions: plan.questions.length, reserve: plan.reserve.length, repeated: plan.repeated };
}

export async function getPlannedQuestion(questionId, eventDate) {
  const plan = await MiniEventPlan.findByPk(eventDate);
  if (plan) return plan.questions.find(item => String(item.id) === String(questionId)) || null;
  const bank = await loadMiniEventBank();
  return bank.find(item => String(item.id) === String(questionId)) || null;
}
