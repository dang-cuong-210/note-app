import { supabase } from '@/lib/supabase';
import type { Habit, HabitLog, HabitSchedulePeriod, HabitDate } from './types';

/** Cloud-only initial implementation. Do not show offline writes as completed. */
export async function listHabits(): Promise<Habit[]> {
  const { data, error } = await supabase.from('habits').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Habit[];
}

export async function listHabitSchedules(habitId: string): Promise<HabitSchedulePeriod[]> {
  const { data, error } = await supabase.from('habit_schedule_periods')
    .select('*').eq('habit_id', habitId).order('effective_from');
  if (error) throw error;
  return (data ?? []) as HabitSchedulePeriod[];
}

export async function listHabitLogs(habitId: string, from: HabitDate, through: HabitDate): Promise<HabitLog[]> {
  const { data, error } = await supabase.from('habit_logs')
    .select('*').eq('habit_id', habitId).gte('checkin_date', from)
    .lte('checkin_date', through).order('checkin_date');
  if (error) throw error;
  return (data ?? []) as HabitLog[];
}

export async function checkIn(habitId: string, date: HabitDate): Promise<HabitLog> {
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const userId = userData.user?.id;
  if (!userId) throw new Error('Sign in before checking in');
  const { data, error } = await supabase.from('habit_logs')
    .upsert({ id: crypto.randomUUID(), habit_id: habitId, user_id: userId, checkin_date: date },
      { onConflict: 'habit_id,checkin_date', ignoreDuplicates: true })
    .select('*');
  if (error) throw error;
  if (data?.[0]) return data[0] as HabitLog;
  const { data: existing, error: readError } = await supabase.from('habit_logs')
    .select('*').eq('habit_id', habitId).eq('checkin_date', date).single();
  if (readError) throw readError;
  return existing as HabitLog;
}

export async function undoCheckIn(habitId: string, date: HabitDate): Promise<void> {
  const { error } = await supabase.from('habit_logs')
    .delete().eq('habit_id', habitId).eq('checkin_date', date);
  if (error) throw error;
}
