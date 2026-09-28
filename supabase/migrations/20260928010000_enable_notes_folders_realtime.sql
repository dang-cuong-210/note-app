-- Publish user-owned note and folder changes for authenticated Realtime clients.
-- RLS SELECT policies remain authoritative for which rows each subscriber sees.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'folders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.folders;
  END IF;
END;
$$;
