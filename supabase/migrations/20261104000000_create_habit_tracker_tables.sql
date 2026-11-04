-- Habit Tracker foundation: isolated from Notes tables.
CREATE TABLE public.habits (
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  icon text NOT NULL DEFAULT '📚',
  color text NOT NULL DEFAULT '#B65F45' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  timezone text NOT NULL DEFAULT 'Asia/Tokyo',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);

CREATE TABLE public.habit_schedule_periods (
  id text PRIMARY KEY,
  habit_id text NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  effective_until date,
  weekdays integer[] NOT NULL CHECK (
    array_length(weekdays, 1) BETWEEN 1 AND 7
    AND weekdays <@ ARRAY[1,2,3,4,5,6,7]
  ),
  is_paused boolean NOT NULL DEFAULT false,
  CHECK (effective_until IS NULL OR effective_until >= effective_from),
  FOREIGN KEY (habit_id, user_id) REFERENCES public.habits(id, user_id) ON DELETE CASCADE
);

CREATE TABLE public.habit_logs (
  id text PRIMARY KEY,
  habit_id text NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_date date NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (habit_id, checkin_date),
  FOREIGN KEY (habit_id, user_id) REFERENCES public.habits(id, user_id) ON DELETE CASCADE
);

CREATE INDEX idx_habits_user ON public.habits(user_id);
CREATE INDEX idx_habit_schedules_habit_dates ON public.habit_schedule_periods(habit_id, effective_from);
CREATE INDEX idx_habit_logs_habit_date ON public.habit_logs(habit_id, checkin_date DESC);

ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_schedule_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY habits_select ON public.habits FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY habits_insert ON public.habits FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY habits_update ON public.habits FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY habits_delete ON public.habits FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY habit_schedules_select ON public.habit_schedule_periods FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY habit_schedules_insert ON public.habit_schedule_periods FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY habit_schedules_update ON public.habit_schedule_periods FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY habit_schedules_delete ON public.habit_schedule_periods FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY habit_logs_select ON public.habit_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY habit_logs_insert ON public.habit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY habit_logs_delete ON public.habit_logs FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Enforce valid check-in dates even if clients bypass UI.
CREATE FUNCTION public.validate_habit_log_date() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE habit_start date; habit_tz text;
BEGIN
  SELECT h.start_date, h.timezone INTO habit_start, habit_tz
  FROM public.habits h WHERE h.id = NEW.habit_id AND h.user_id = NEW.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Habit not found'; END IF;
  IF NEW.checkin_date < habit_start OR NEW.checkin_date > (now() AT TIME ZONE habit_tz)::date THEN
    RAISE EXCEPTION 'Check-in date is outside permitted range';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_habit_log_date_before_insert
BEFORE INSERT OR UPDATE ON public.habit_logs
FOR EACH ROW EXECUTE FUNCTION public.validate_habit_log_date();
