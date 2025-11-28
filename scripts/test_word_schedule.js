// scripts/test_word_schedule.js
// Lightweight self-test for node-schedule recurrence rules with time zones.
// Schedules two one-minute-apart jobs in Europe/Moscow time and prints when they fire.

import schedule from 'node-schedule';

function buildRule(targetDate) {
  const rule = new schedule.RecurrenceRule();
  rule.tz = 'Europe/Moscow';
  rule.hour = targetDate.getHours();
  rule.minute = targetDate.getMinutes();
  rule.second = targetDate.getSeconds();
  return rule;
}

// Compute two targets: +1 minute and +2 minutes in Moscow time.
const now = new Date();
const moscowNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));

function addMinutes(date, minutes) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

const targets = [
  { label: 'slot_0_test', date: addMinutes(moscowNow, 1) },
  { label: 'slot_1_test', date: addMinutes(moscowNow, 2) }
];

console.log('🕒 Current time (server):', now.toISOString());
console.log('🕒 Current time (Moscow):', moscowNow.toISOString());

targets.forEach(({ label, date }, idx) => {
  const rule = buildRule(date);
  const job = schedule.scheduleJob(`test_word_game_${idx}`, rule, () => {
    const firedAt = new Date();
    const firedMsk = new Date(firedAt.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    console.log(`✅ Fired ${label} at server=${firedAt.toISOString()} moscow=${firedMsk.toISOString()}`);
  });

  if (!job) {
    console.error(`❌ Failed to schedule ${label}`);
    return;
  }

  try {
    const next = job.nextInvocation();
    console.log(`⏰ Next for ${label}: ${next?.toString?.()}`);
  } catch (err) {
    console.warn(`⚠️ Could not read next invocation for ${label}: ${err.message}`);
  }
});

// Keep process alive long enough to see both jobs fire.
const maxWaitMs = 3 * 60 * 1000; // 3 minutes
setTimeout(async () => {
  console.log('🛑 Shutting down scheduler...');
  await schedule.gracefulShutdown();
  process.exit(0);
}, maxWaitMs);
