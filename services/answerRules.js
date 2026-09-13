export function evaluateQueueAnswer(type, item, answer) {
  if (type === 'fact') {
    if (!['true', 'false'].includes(answer) || typeof item.isTrue !== 'boolean') throw new Error('Invalid fact answer');
    const correct = (answer === 'true') === item.isTrue;
    return { correct, points: correct ? 10 : 2 };
  }
  if (!/^[0-3]$/.test(String(answer)) || !Array.isArray(item.options) ||
      Number(answer) >= item.options.length || !Number.isInteger(item.correctIndex) ||
      item.correctIndex < 0 || item.correctIndex >= item.options.length) throw new Error('Invalid answer options');
  const correct = Number(answer) === item.correctIndex;
  const reward = type === 'quiz' ? ({ A2: 1, B2: 3 }[item.level] || 2) : 5;
  return { correct, points: correct ? reward : 0 };
}
