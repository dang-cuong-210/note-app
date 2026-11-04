import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidHabitDate, isoWeekday, scheduledOn, completionRate, currentStreak } from '../src/features/habits/calendar.mjs';
test('reject invalid calendar dates', () => {
  assert.equal(isValidHabitDate('2026-02-29'), false);
  assert.equal(isValidHabitDate('2024-02-29'), true);
  assert.equal(isValidHabitDate('2026-13-01'), false);
});
test('ISO weekday starts on Monday', () => {
  assert.equal(isoWeekday('2026-11-02'), 1);
  assert.equal(isoWeekday('2026-11-08'), 7);
});
test('schedule respects periods and pauses', () => {
  const periods = [{ effective_from:'2026-11-02', effective_until:'2026-11-06', weekdays:[1,2,3,4,5], is_paused:false },
    { effective_from:'2026-11-07', effective_until:null, weekdays:[1,2,3,4,5], is_paused:true }];
  assert.equal(scheduledOn('2026-11-04', periods), true);
  assert.equal(scheduledOn('2026-11-07', periods), false);
  assert.equal(scheduledOn('2026-11-09', periods), false);
});
test('completion rate counts scheduled dates only', () => {
  assert.equal(completionRate(['2026-11-02','2026-11-03'], ['2026-11-02']), 50);
  assert.equal(completionRate([], []), 0);
});
test('streak skips non-scheduled days and tolerates unfinished today', () => {
  const dates = ['2026-10-30','2026-11-02','2026-11-03','2026-11-04'];
  assert.equal(currentStreak(dates, dates.slice(0,3), '2026-11-04'), 3);
  assert.equal(currentStreak(dates, dates.slice(0,2), '2026-11-04'), 0);
});

test('unscheduled weekends do not interrupt a weekday streak', () => {
  const scheduled = ['2026-10-29', '2026-10-30', '2026-11-02'];
  assert.equal(currentStreak(scheduled, scheduled, '2026-11-02'), 3);
});
test('a missed prior scheduled day interrupts the streak', () => {
  const scheduled = ['2026-10-30', '2026-11-02', '2026-11-03'];
  assert.equal(currentStreak(scheduled, ['2026-10-30', '2026-11-03'], '2026-11-03'), 1);
});
test('completed check-ins are deduplicated for completion percentage', () => {
  assert.equal(completionRate(['2026-11-02','2026-11-03'], ['2026-11-02','2026-11-02']), 50);
});
test('invalid input dates are rejected before schedule evaluation', () => {
  assert.throws(() => scheduledOn('2026-02-30', []), /Invalid calendar date/);
});
