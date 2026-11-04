/** Pure calendar logic; all inputs are YYYY-MM-DD calendar dates. */
export function isValidHabitDate(value) {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function isoWeekday(value) {
  if (!isValidHabitDate(value)) throw new Error('Invalid calendar date');
  return ((new Date(value + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1;
}
export function scheduledOn(date, periods) {
  const day = isoWeekday(date);
  return periods.some(p => p.effective_from <= date &&
    (p.effective_until == null || date <= p.effective_until) &&
    !p.is_paused && p.weekdays.includes(day));
}
export function completionRate(dates, completedDates) {
  if (dates.length === 0) return 0;
  const done = new Set(completedDates);
  return Math.round(100 * dates.filter(d => done.has(d)).length / dates.length);
}
/** Current streak through today, or through the last scheduled date before today. */
export function currentStreak(scheduledDatesAscending, completedDates, today) {
  const completed = new Set(completedDates);
  const dates = scheduledDatesAscending.filter(d => d <= today);
  let count = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (!completed.has(dates[i])) {
      if (dates[i] === today) continue; // today is still in progress
      break;
    }
    count++;
  }
  return count;
}
