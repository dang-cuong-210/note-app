# Codex handoff — Tanooki Habit Tracker

Date: 2026-11-04
Repository: dang-cuong-210/note-app
Working branch: feat/habit-tracker-foundation
Base branch: feat/tanooki-ui-v1

## Goal and agreed MVP
Build Habit Tracker **inside Tanooki Notes PWA**, reusing Supabase auth, app shell, and warm Tanooki styling. Do not create a separate app. MVP is binary daily check-in, selected weekday schedule, historical backfill, streak, weekly/monthly completion, heatmap and trends. No AI, social, gamification or numeric habit tracking.

UX decisions: Today list + weekly grid; Habit Detail contains heatmap and per-habit stats; Statistics screen has weekly/monthly trends and comparisons. Desktop sidebar entry; Mobile Home and More entry, **no sixth bottom navigation tab**. Create/Edit uses small desktop modal and full-height mobile page.

## Work already committed on this branch
- `supabase/migrations/20261104000000_create_habit_tracker_tables.sql`: habits, habit_schedule_periods, habit_logs, indexes, RLS, initial date check.
- `supabase/migrations/20261104001000_habit_tracker_integrity.sql`: non-overlapping schedules and schedule-aware check-in validator.
- `src/features/habits/types.ts`: TypeScript interfaces.
- `src/features/habits/services.ts`: cloud-only reads, check-in and undo.
- `src/features/habits/calendar.mjs`: date, weekday, schedule, completion rate, streak helpers.
- `tests/habitCalendar.test.mjs`: 9 test cases.
- `.github/workflows/habit-tracker-tests.yml`: focused Node 22 test workflow.

Notable commits: 79346dc, 147c5b2, 9f6a772, 9426218, d52d2a2, c8abdd2, 0fd49b1, 3726ab6, 77a311d.

## IMPORTANT: verification and known risks
Do not assume the implementation is ready. Earlier assistant stated 9/9 tests passed in a separate environment; this handoff does not independently verify that claim. **Run tests, lint, typecheck, build and database integration tests yourself**. No production migration, merge or deploy has been performed.

Check these specific issues:
1. `services.ts` imports `@/lib/supabase`; confirm alias support in tsconfig/Vite. Prefer existing project's import conventions.
2. Check `crypto.randomUUID()` availability in target Safari/iPhone PWA and ID conventions.
3. `checkIn` uses upsert with ignoreDuplicates and `select`; verify PostgREST behavior, RLS and idempotency on concurrent devices.
4. RLS must prevent cross-user reads/writes; verify child ownership with composite FKs.
5. Schedule history: changing schedule must not retroactively rewrite historical streaks; paused periods must not count; check for gaps and overlaps, concurrency, schedule edits and timezone changes.
6. SQL date check must reject future local dates, off-schedule dates, paused dates and archived habits. Verify user-supplied timezone is valid; consider keeping timezone immutable after creation.
7. Verify check-in and schedule logic against real PostgreSQL/Supabase; pure JS tests do not cover SQL triggers or migrations.
8. Existing migration timestamp and SQL conventions should match repo.
9. Check behavior of currentStreak if today is unfinished and most recent scheduled day is older; consider explicit tests.
10. Avoid overengineering or modifying Notes offline-sync machinery. Habit Tracker initial implementation is online-only and should show clear pending/error/offline states.

## Architecture observed in repository
React 18, TypeScript, Vite, Tailwind, Supabase. No React Router in package.json. `src/App.tsx` coordinates views; `src/lib/navigation.ts` defines `ViewType`; `src/components/Sidebar.tsx` desktop navigation; `src/components/MobileAppNavigation.tsx` defines mobile bottom navigation and More view; `src/hooks/useAppData.ts` is notes-only state and sync. Keep habits isolated in `src/features/habits/`.

## Suggested execution order
1. Fetch branch, inspect diff, run `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Fix failures without unrelated refactors.
2. Test SQL migrations in disposable local Supabase/PostgreSQL and add SQL integration checks for RLS, schedule overlap, backfill, future date, and concurrent duplicate check-ins.
3. Finish minimal Habit CRUD service and state hooks with loading/error handling, safe auth/logout behavior, online-only sync.
4. Build Habit Dashboard (Today + weekly grid), Create/Edit Habit, Habit Detail, Statistics incrementally.
5. Wire Desktop sidebar and Mobile Home/More, preserve existing bottom navigation.
6. Run full regression, desktop/mobile responsive review, iPhone PWA checks.

## Change control
Do not modify production Supabase, merge, push to main, or deploy without explicit user approval. Work on feature branch and report exact verification results, files and commits. Ask before introducing substantial new scope or saving content to unrelated services.
