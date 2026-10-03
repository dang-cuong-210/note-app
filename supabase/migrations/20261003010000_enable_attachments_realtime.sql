-- Publish attachment metadata changes; existing owner-only CRUD RLS stays intact.
-- Do not replace the publication (notes/folders must remain published).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'attachments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attachments;
  END IF;
END;
$$;

-- Deleted rows cannot be checked with SELECT RLS. FULL preserves user_id in
-- WAL so Realtime can apply the account filter to DELETE on the server.
-- The client may still receive a primary-key-only old row under RLS.
ALTER TABLE public.attachments REPLICA IDENTITY FULL;
