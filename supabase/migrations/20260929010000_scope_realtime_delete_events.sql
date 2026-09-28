-- Postgres cannot apply row-level SELECT policies after a row is deleted.
-- Preserve user_id in the DELETE payload so the account-scoped Realtime
-- filters can reject another account's note and folder events server-side.
ALTER TABLE public.notes REPLICA IDENTITY FULL;
ALTER TABLE public.folders REPLICA IDENTITY FULL;
