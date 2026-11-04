-- Follow-up safeguards for Habit Tracker foundation.
-- Lock parent habit row to serialize concurrent schedule edits.
CREATE OR REPLACE FUNCTION public.validate_habit_schedule_period()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE h_start date;
BEGIN
  SELECT start_date INTO h_start FROM public.habits
    WHERE id = NEW.habit_id AND user_id = NEW.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Habit not found'; END IF;
  IF NEW.effective_from < h_start THEN RAISE EXCEPTION 'Schedule starts before habit'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.habit_schedule_periods p
    WHERE p.habit_id = NEW.habit_id AND p.id <> NEW.id
      AND daterange(p.effective_from, p.effective_until, '[]')
          && daterange(NEW.effective_from, NEW.effective_until, '[]')
  ) THEN RAISE EXCEPTION 'Overlapping schedule periods'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_habit_schedule_period_before_write
BEFORE INSERT OR UPDATE ON public.habit_schedule_periods
FOR EACH ROW EXECUTE FUNCTION public.validate_habit_schedule_period();

-- Replace the initial date-only validator with schedule-aware validation.
CREATE OR REPLACE FUNCTION public.validate_habit_log_date()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE h_start date; h_tz text; h_status text; iso_day integer;
BEGIN
  SELECT start_date, timezone, status INTO h_start, h_tz, h_status
  FROM public.habits WHERE id = NEW.habit_id AND user_id = NEW.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Habit not found'; END IF;
  IF NEW.checkin_date < h_start OR NEW.checkin_date > (now() AT TIME ZONE h_tz)::date THEN
    RAISE EXCEPTION 'Check-in date outside permitted range';
  END IF;
  IF h_status = 'archived' THEN RAISE EXCEPTION 'Archived habit cannot be checked in'; END IF;
  iso_day := EXTRACT(ISODOW FROM NEW.checkin_date)::integer;
  IF NOT EXISTS (
    SELECT 1 FROM public.habit_schedule_periods p
    WHERE p.habit_id = NEW.habit_id AND p.user_id = NEW.user_id
      AND p.effective_from <= NEW.checkin_date
      AND (p.effective_until IS NULL OR p.effective_until >= NEW.checkin_date)
      AND NOT p.is_paused AND iso_day = ANY(p.weekdays)
  ) THEN RAISE EXCEPTION 'Date not scheduled for this habit'; END IF;
  RETURN NEW;
END $$;

-- Avoid client tampering with completion timestamp or owner of an existing log.
CREATE OR REPLACE FUNCTION public.prevent_habit_log_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.habit_id <> OLD.habit_id OR NEW.user_id <> OLD.user_id
    OR NEW.checkin_date <> OLD.checkin_date THEN
    RAISE EXCEPTION 'Habit log identity cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER prevent_habit_log_mutation_before_update
BEFORE UPDATE ON public.habit_logs FOR EACH ROW
EXECUTE FUNCTION public.prevent_habit_log_mutation();

-- Explicitly restrict privileges on SQL helper functions.
REVOKE ALL ON FUNCTION public.validate_habit_schedule_period() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_habit_log_date() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_habit_log_mutation() FROM PUBLIC;
