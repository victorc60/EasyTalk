import express from 'express';
import axios from 'axios';
import { sendUserMessage, sendAdminMessage } from '../utils/botUtils.js';

const bossNames = {
  'present-perfect-dragon': 'Present Perfect Dragon',
  'modal-hydra': 'Modal Hydra',
  'article-golem': 'Article Golem',
};

export function startBossGrammarWebhook(bot) {
  const apiBase = process.env.BOSS_GRAMMAR_API_BASE;
  const port = Number(process.env.BOSS_GRAMMAR_PORT || 8787);
  const secret = process.env.BOSS_GRAMMAR_WEBHOOK_SECRET;

  if (!apiBase) {
    console.warn('Boss Grammar webhook disabled: BOSS_GRAMMAR_API_BASE is not set');
    return;
  }

  const app = express();
  app.use(express.json());

  app.post('/boss-grammar/webhook', async (req, res) => {
    try {
      if (secret && req.headers['x-boss-grammar-secret'] !== secret) {
        return res.status(401).json({ ok: false, error: 'unauthorized' });
      }

      const { chatId, sessionId } = req.body || {};
      if (!chatId || !sessionId) {
        return res.status(400).json({ ok: false, error: 'chatId and sessionId required' });
      }

      // ensure session finished + fetch errors
      let errors = [];
      try {
        const finish = await axios.post(`${apiBase}/api/session/${sessionId}/finish`);
        errors = finish.data?.errors || [];
      } catch (err) {
        console.warn('Finish session failed or already finished', err?.message);
      }

      const snapshot = await axios.get(`${apiBase}/api/session/${sessionId}/nextTask`);
      const data = snapshot.data || {};
      if (data.ok === false) {
        throw new Error(data.error || 'Failed to fetch session snapshot');
      }

      const progress = data.progress || {};
      const attempts = data.attempts || [];
      const mistakes = attempts.filter((a) => !a.isCorrect);
      const bossId = attempts[0]?.task?.bossId ?? 'boss';
      const bossLabel = bossNames[bossId] || bossNames[String(bossId)] || 'Boss Grammar';
      const accuracy =
        progress.total && progress.total > 0 ? Math.round((progress.correct / progress.total) * 100) : 0;

      const reportLines = [
        '🎮 <b>Boss Grammar</b>',
        `Босс: ${bossLabel}`,
        `Очки: ${progress.score ?? 0}`,
        `Точность: ${accuracy}% (${progress.correct ?? 0}/${progress.total ?? 0})`,
        `Ошибок: ${mistakes.length}`,
      ];

      if (errors.length) {
        const hintLines = errors.slice(0, 3).map((e, idx) => `${idx + 1}) ${e.correct} — ${e.ruleHint || ''}`);
        reportLines.push('', '<b>Ошибки:</b>', ...hintLines);
        if (errors.length > 3) reportLines.push(`…ещё ${errors.length - 3}`);
      }

      await sendUserMessage(bot, chatId, reportLines.join('\n'), { parse_mode: 'HTML' });
      return res.json({ ok: true });
    } catch (error) {
      console.error('Boss Grammar webhook error:', error?.message);
      await sendAdminMessage(bot, `Boss Grammar webhook error: ${error?.message}`);
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  app.get('/boss-grammar/health', (req, res) => res.json({ ok: true }));

  app.listen(port, () => {
    console.log(`Boss Grammar webhook listening on :${port}`);
  });
}
