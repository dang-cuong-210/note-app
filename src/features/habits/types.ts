export type HabitStatus = 'active' | 'paused' | 'archived';
/** ISO local calendar date, YYYY-MM-DD; never parse as a UTC timestamp for display. */
export type HabitDate = string;
/** ISO weekday: Monday = 1, Sunday = 7. */
export type HabitWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export interface Habit {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  timezone: string;
  start_date: HabitDate;
  status: HabitStatus;
  created_at: string;
}
export interface HabitSchedulePeriod {
  id: string;
  habit_id: string;
  user_id: string;
  effective_from: HabitDate;
  effective_until: HabitDate | null;
  weekdays: HabitWeekday[];
  is_paused: boolean;
}
export interface HabitLog {
  id: string;
  habit_id: string;
  user_id: string;
  checkin_date: HabitDate;
  completed_at: string;
}
