import db from './client.js';

const bosses = [
  { code: 'present-perfect-dragon', title: 'Present Perfect Dragon', week: 1 },
  { code: 'modal-hydra', title: 'Modal Hydra', week: 2 },
  { code: 'article-golem', title: 'Article Golem', week: 3 },
];

const tasks = [
  // Present Perfect (10)
  {
    boss: 'present-perfect-dragon',
    type: 'choice',
    prompt: 'Choose the correct Present Perfect sentence.',
    options: ['I have done my homework.', 'I did my homework yesterday.'],
    answer: 'I have done my homework.',
    explanation: 'Present Perfect describes experience without finished time.',
  },
  {
    boss: 'present-perfect-dragon',
    type: 'cloze',
    prompt: 'I ____ to London twice.',
    options: ['have been', 'was', 'had been'],
    answer: 'have been',
    explanation: 'Use have/has + participle for life experience.',
  },
  {
    boss: 'present-perfect-dragon',
    type: 'choice',
    prompt: 'Pick the sentence with already in the right place.',
    options: ['I already have finished.', 'I have already finished.'],
    answer: 'I have already finished.',
    explanation: 'Already usually goes between have/has and participle.',
  },
  {
    boss: 'present-perfect-dragon',
    type: 'choice',
    prompt: 'Choose the best: She ____ visited that museum three times.',
    options: ['has', 'have', 'had'],
    answer: 'has',
    explanation: 'She → has + past participle.',
  },
  {
    boss: 'present-perfect-dragon',
    type: 'cloze',
    prompt: 'They ____ lived here since 2015.',
    options: ['have', 'has', 'had'],
    answer: 'have',
    explanation: 'They → have + past participle.',
  },
  {
    boss: 'present-perfect-dragon',
    type: 'choice',
    prompt: 'Pick the correct form: He ____ never flown before.',
    options: ['has', 'have', 'was'],
    answer: 'has',
    explanation: 'He → has + past participle.',
  },
  {
    boss: 'present-perfect-dragon',
    type: 'choice',
    prompt: 'Select: We ____ just arrived.',
    options: ['have', 'has', 'had'],
    answer: 'have',
    explanation: 'We → have + past participle; just fits Present Perfect.',
  },
  {
    boss: 'present-perfect-dragon',
    type: 'cloze',
    prompt: '____ you ever tried sushi?',
    options: ['Have', 'Did', 'Are'],
    answer: 'Have',
    explanation: 'Ever + Present Perfect question uses have/has.',
  },
  {
    boss: 'present-perfect-dragon',
    type: 'choice',
    prompt: 'Choose the sentence with for/since used correctly.',
    options: ['I have known her for five years.', 'I have known her since five years.'],
    answer: 'I have known her for five years.',
    explanation: 'Use for + duration.',
  },
  {
    boss: 'present-perfect-dragon',
    type: 'cloze',
    prompt: 'He ____ worked here since last summer.',
    options: ['has', 'have', 'was'],
    answer: 'has',
    explanation: 'He → has + past participle.',
  },
  // Modal Hydra (10)
  {
    boss: 'modal-hydra',
    type: 'choice',
    prompt: 'Choose the correct modal for deduction: He ____ be at work; the lights are off.',
    options: ['must', 'can’t', 'should'],
    answer: 'can’t',
    explanation: 'Negative deduction uses can’t.',
  },
  {
    boss: 'modal-hydra',
    type: 'cloze',
    prompt: 'You ____ leave early if you finish the report.',
    options: ['may', 'must', 'shouldn’t'],
    answer: 'may',
    explanation: 'May expresses permission.',
  },
  {
    boss: 'modal-hydra',
    type: 'choice',
    prompt: 'Fill in: She ____ play the piano when she was five.',
    options: ['could', 'can', 'might'],
    answer: 'could',
    explanation: 'Could = past ability.',
  },
  {
    boss: 'modal-hydra',
    type: 'cloze',
    prompt: 'We ____ wear uniforms at this school.',
    options: ['must', 'have to', 'can'],
    answer: 'have to',
    explanation: 'Obligation from rules often uses have to.',
  },
  {
    boss: 'modal-hydra',
    type: 'choice',
    prompt: 'Choose polite request: ____ you help me, please?',
    options: ['Could', 'Must', 'May not'],
    answer: 'Could',
    explanation: 'Could for polite requests.',
  },
  {
    boss: 'modal-hydra',
    type: 'choice',
    prompt: 'Select: You ____ drive fast here; it’s dangerous.',
    options: ['shouldn’t', 'must', 'can'],
    answer: 'shouldn’t',
    explanation: 'Advice against → shouldn’t.',
  },
  {
    boss: 'modal-hydra',
    type: 'cloze',
    prompt: 'Passengers ____ show tickets before boarding.',
    options: ['must', 'could', 'might'],
    answer: 'must',
    explanation: 'Strong obligation → must.',
  },
  {
    boss: 'modal-hydra',
    type: 'choice',
    prompt: 'Choose possibility: It ____ rain later.',
    options: ['might', 'must', 'has to'],
    answer: 'might',
    explanation: 'Might expresses possibility.',
  },
  {
    boss: 'modal-hydra',
    type: 'cloze',
    prompt: 'He ____ be sleeping; his phone is off.',
    options: ['might', 'mustn’t', 'can'],
    answer: 'might',
    explanation: 'Might for present possibility.',
  },
  {
    boss: 'modal-hydra',
    type: 'choice',
    prompt: 'Select permission: ____ I open the window?',
    options: ['May', 'Must', 'Should'],
    answer: 'May',
    explanation: 'May for asking permission.',
  },
  // Article Golem (10)
  {
    boss: 'article-golem',
    type: 'cloze',
    prompt: 'He works as ____ engineer at a startup.',
    options: ['an', 'the', '—'],
    answer: 'an',
    explanation: 'Use an before vowel sounds with jobs.',
  },
  {
    boss: 'article-golem',
    type: 'choice',
    prompt: 'Choose the correct option: ____ Mount Everest is the highest mountain.',
    options: ['—', 'The', 'A'],
    answer: 'The',
    explanation: 'Use the with unique mountains by name.',
  },
  {
    boss: 'article-golem',
    type: 'choice',
    prompt: 'Pick the correct sentence.',
    options: ['I bought the bread yesterday (general).', 'I bought bread yesterday.'],
    answer: 'I bought bread yesterday.',
    explanation: 'No article with uncountable in general sense.',
  },
  {
    boss: 'article-golem',
    type: 'cloze',
    prompt: 'Can you pass me ____ salt on the table?',
    options: ['the', 'a', '—'],
    answer: 'the',
    explanation: 'Specific item both know → the.',
  },
  {
    boss: 'article-golem',
    type: 'choice',
    prompt: 'Choose: She is ____ best player in our team.',
    options: ['the', 'a', '—'],
    answer: 'the',
    explanation: 'Superlatives use the.',
  },
  {
    boss: 'article-golem',
    type: 'cloze',
    prompt: 'They went to ____ cinema last night.',
    options: ['the', 'a', '—'],
    answer: 'the',
    explanation: 'Places used in general sense with the (cinema, theatre).',
  },
  {
    boss: 'article-golem',
    type: 'choice',
    prompt: 'Select: I need ____ umbrella; it’s raining.',
    options: ['an', 'the', '—'],
    answer: 'an',
    explanation: 'First mention singular countable → a/an.',
  },
  {
    boss: 'article-golem',
    type: 'cloze',
    prompt: 'Paris is ____ capital of France.',
    options: ['the', 'a', '—'],
    answer: 'the',
    explanation: 'Unique noun → the.',
  },
  {
    boss: 'article-golem',
    type: 'choice',
    prompt: 'Pick correct: She is ____ doctor.',
    options: ['a', 'the', '—'],
    answer: 'a',
    explanation: 'Jobs use a/an on first mention.',
  },
  {
    boss: 'article-golem',
    type: 'cloze',
    prompt: 'I saw ____ interesting movie.',
    options: ['an', 'the', '—'],
    answer: 'an',
    explanation: 'First mention, vowel sound → an.',
  },
];

const seed = () => {
  db.pragma('foreign_keys = ON');
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM attempts').run();
    db.prepare('DELETE FROM sessions').run();
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM bosses').run();

    const insertBoss = db.prepare('INSERT INTO bosses (code, title, week) VALUES (?, ?, ?)');
    const bossIdMap = {};
    bosses.forEach((b) => {
      const res = insertBoss.run(b.code, b.title, b.week);
      bossIdMap[b.code] = res.lastInsertRowid;
    });

    const insertTask = db.prepare(
      'INSERT INTO tasks (boss_id, type, payload_json, answer_key, cefr) VALUES (?, ?, ?, ?, ?)',
    );

    tasks.forEach((t) => {
      insertTask.run(
        bossIdMap[t.boss],
        t.type,
        JSON.stringify({ prompt: t.prompt, options: t.options, explanation: t.explanation }),
        t.answer,
        'A2',
      );
    });
  });

  tx();
  console.log('Seed completed: bosses + tasks inserted.');
};

seed();
