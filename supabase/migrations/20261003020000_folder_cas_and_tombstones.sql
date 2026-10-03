-- Folder-only CAS. Tombstones are terminal: delayed CREATE retries cannot revive
-- IDs deleted elsewhere. Existing owner-only SELECT RLS and publication remain.
BEGIN;
ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;
ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS last_operation text;

CREATE OR REPLACE FUNCTION public.write_folder_versioned(
  p_account uuid, p_folder jsonb, p_expected bigint, p_operation text, p_delete boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  actor uuid := auth.uid();
  current_row public.folders%ROWTYPE;
  folder_id text := p_folder->>'id';
BEGIN
  IF actor IS NULL OR p_account IS DISTINCT FROM actor THEN
    RAISE EXCEPTION 'Account does not match authenticated session' USING ERRCODE = '42501';
  END IF;
  IF folder_id IS NULL OR folder_id = '' OR p_operation IS NULL OR p_operation = ''
     OR p_expected IS NULL OR p_expected < -1 OR p_delete IS NULL THEN
    RAISE EXCEPTION 'Invalid folder operation' USING ERRCODE = '22023';
  END IF;
  -- Serialize even absent-ID operations, so CREATE and DELETE(-1) cannot race.
  PERFORM pg_advisory_xact_lock(hashtextextended(folder_id, 0));
  SELECT * INTO current_row FROM public.folders WHERE id = folder_id AND user_id = actor FOR UPDATE;
  IF FOUND THEN
    IF current_row.last_operation = p_operation THEN
      RETURN jsonb_build_object('status', CASE WHEN current_row.deleted THEN 'deleted' ELSE 'saved' END,
                                'folder', to_jsonb(current_row));
    END IF;
    IF current_row.deleted THEN
      RETURN jsonb_build_object('status', CASE WHEN p_delete THEN 'deleted' ELSE 'conflict' END,
                                'folder', to_jsonb(current_row));
    END IF;
    IF current_row.revision <> p_expected THEN
      RETURN jsonb_build_object('status', 'conflict', 'folder', to_jsonb(current_row));
    END IF;
    UPDATE public.folders SET
      name = CASE WHEN p_delete THEN name ELSE p_folder->>'name' END,
      parent_id = CASE WHEN p_delete THEN parent_id ELSE p_folder->>'parent_id' END,
      deleted = p_delete, revision = revision + 1, last_operation = p_operation
    WHERE id = folder_id AND user_id = actor RETURNING * INTO current_row;
  ELSE
    IF NOT p_delete AND p_expected <> -1 THEN
      RETURN jsonb_build_object('status', 'conflict', 'folder', NULL);
    END IF;
    -- Also reserve never-uploaded IDs on DELETE. Do not touch another owner's ID.
    INSERT INTO public.folders(id, user_id, name, parent_id, created_at, revision, deleted, last_operation)
    VALUES(folder_id, actor, COALESCE(p_folder->>'name', ''), p_folder->>'parent_id',
           COALESCE((p_folder->>'created_at')::bigint, 0), 0, p_delete, p_operation)
    ON CONFLICT (id) DO NOTHING RETURNING * INTO current_row;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict', 'folder', NULL); END IF;
  END IF;
  RETURN jsonb_build_object('status', CASE WHEN p_delete THEN 'deleted' ELSE 'saved' END,
                            'folder', to_jsonb(current_row));
END;
$$;

-- SECURITY DEFINER is necessary here: SECURITY INVOKER would also require direct
-- write privileges, allowing old unconditional upserts to bypass CAS/tombstones.
-- All statements above constrain ownership; no dynamic SQL or note mutations.
REVOKE INSERT, UPDATE, DELETE ON public.folders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_folder_versioned(uuid, jsonb, bigint, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.write_folder_versioned(uuid, jsonb, bigint, text, boolean) TO authenticated;
-- Preserve the existing account-filtered physical DELETE event support.
ALTER TABLE public.folders REPLICA IDENTITY FULL;
COMMIT;
