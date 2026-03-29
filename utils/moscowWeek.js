/**
 * Календарная неделя (пн–вс) в часовом поясе Europe/Chisinau.
 *
 * Важно: нельзя делать `new Date(d.toLocaleString(..., { timeZone: 'Europe/Chisinau' }))` —
 * строка парсится в локальном TZ сервера (Railway UTC и т.д.), из‑за этого съезжают
 * границы недели и недельная статистика оказывается пустой.
 */

const TZ_MOSCOW = 'Europe/Chisinau';

/** Карта короткого имени дня недели (en-US) → 0=вс … 6=сб */
const WEEKDAY_SUN0 = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Сегодняшняя дата по календарю Москвы: YYYY-MM-DD */
export function getMoscowYmd(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: TZ_MOSCOW });
}

/**
 * День недели (0=вс … 6=сб) для момента date по календарю Москвы.
 */
export function getMoscowWeekdaySun0(date = new Date()) {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ_MOSCOW,
    weekday: 'short',
  }).format(date);
  const key = short.replace(/\.$/, '').trim();
  return WEEKDAY_SUN0[key] ?? 0;
}

/**
 * Сдвиг ISO-календарной даты YYYY-MM-DD на deltaDays (чистая арифметика дат).
 */
export function addIsoCalendarDays(ymd, deltaDays) {
  const [y, m, d] = ymd.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) + deltaDays * 86400000;
  const dt = new Date(ms);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Понедельник–воскресенье (неделя, в которую попадает refDate по Кишинёву).
 * @returns {{ weekStartKey: string, weekEndKey: string, weekKey: string }}
 */
export function getMoscowWeekRangeKeys(refDate = new Date()) {
  const todayYmd = getMoscowYmd(refDate);
  const dow = getMoscowWeekdaySun0(refDate);
  const mondayOffset = (dow + 6) % 7;
  const weekStartKey = addIsoCalendarDays(todayYmd, -mondayOffset);
  const weekEndKey = addIsoCalendarDays(weekStartKey, 6);
  return {
    weekStartKey,
    weekEndKey,
    weekKey: `${weekStartKey}_${weekEndKey}`,
  };
}
