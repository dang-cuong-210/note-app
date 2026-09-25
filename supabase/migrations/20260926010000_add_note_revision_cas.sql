-- Atomic compare-and-set for note writes. Apply before deploying the client.
-- Existing notes start at revision 0; each successful write increments it once.
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.save_note_versioned(
  p_note jsonb,
  p_expected_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id text := p_note->>'id';
  v_revision bigint;
  v_updated_at bigint;
BEGIN
  IF auth.uid() IS NULL OR v_id IS NULL OR length(v_id) = 0 THEN
    RAISE EXCEPTION 'Authentication and note ID required';
  END IF;

  IF p_expected_revision = -1 THEN
    INSERT INTO public.notes (
      id, user_id, title, content, folder_id, pinned, archived, trashed,
      trashed_at, created_at, updated_at, revision
    ) VALUES (
      v_id, auth.uid(), coalesce(p_note->>'title', ''),
      coalesce(p_note->>'content', ''), p_note->>'folder_id',
      coalesce((p_note->>'pinned')::boolean, false),
      coalesce((p_note->>'archived')::boolean, false),
      coalesce((p_note->>'trashed')::boolean, false),
      (p_note->>'trashed_at')::bigint,
      coalesce((p_note->>'created_at')::bigint, 0),
      coalesce((p_note->>'updated_at')::bigint, 0), 1
    ) ON CONFLICT (id) DO NOTHING
    RETURNING revision, updated_at INTO v_revision, v_updated_at;
  ELSE
    -- PostgreSQL takes a row lock for UPDATE, rechecks the WHERE clause
    -- after concurrent transactions and permits only one matching revision.
    UPDATE public.notes SET
      title = coalesce(p_note->>'title', ''),
      content = coalesce(p_note->>'content', ''),
      folder_id = p_note->>'folder_id',
      pinned = coalesce((p_note->>'pinned')::boolean, false),
      archived = coalesce((p_note->>'archived')::boolean, false),
      trashed = coalesce((p_note->>'trashed')::boolean, false),
      trashed_at = (p_note->>'trashed_at')::bigint,
      updated_at = greatest(coalesce((p_note->>'updated_at')::bigint, 0), updated_at + 1),
      revision = revision + 1
    WHERE id = v_id AND user_id = auth.uid() AND revision = p_expected_revision
    RETURNING revision, updated_at INTO v_revision, v_updated_at;
  END IF;

  IF v_revision IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'saved', 'revision', v_revision, 'updated_at', v_updated_at);
  END IF;
  RETURN jsonb_build_object('status', 'conflict');
END;
$$;

REVOKE ALL ON FUNCTION public.save_note_versioned(jsonb, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_note_versioned(jsonb, bigint) TO authenticated;
