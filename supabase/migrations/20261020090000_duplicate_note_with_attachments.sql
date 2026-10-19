-- Create a media-containing duplicate as one note/attachment transaction.
-- Reuse the existing CAS insert path so initial revision and ownership rules
-- remain identical to normal note creation.
CREATE OR REPLACE FUNCTION public.duplicate_note_with_attachments(
  p_source_note_id text,
  p_note jsonb,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_note_id text := p_note->>'id';
  v_result jsonb;
  v_note jsonb;
  v_attachments jsonb;
  v_attachment jsonb;
  v_path text;
BEGIN
  IF v_user_id IS NULL OR p_source_note_id IS NULL OR v_note_id IS NULL
     OR v_note_id !~ '^[A-Za-z0-9_-]+$' OR v_note_id = p_source_note_id THEN
    RAISE EXCEPTION 'Authentication, source note, and a distinct destination note ID are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.notes
    WHERE id = p_source_note_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Source note is not available to the authenticated user';
  END IF;

  IF jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Attachment metadata must be an array';
  END IF;

  v_result := public.save_note_versioned(p_note, -1);
  IF v_result->>'status' <> 'saved' THEN
    RAISE EXCEPTION 'Duplicate note could not be created';
  END IF;

  FOR v_attachment IN SELECT value FROM jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb))
  LOOP
    v_path := v_attachment->>'storage_path';
    IF coalesce(v_attachment->>'id', '') = ''
       OR coalesce(v_attachment->>'name', '') = ''
       OR coalesce(v_attachment->>'type', '') = ''
       OR coalesce(v_attachment->>'size', '') !~ '^[0-9]+$'
       OR coalesce(v_attachment->>'created_at', '') !~ '^[0-9]+$'
       OR v_path IS NULL
       OR v_path !~ ('^' || v_user_id::text || '/' || v_note_id || '/[^/]+$') THEN
      RAISE EXCEPTION 'Attachment metadata or storage path is invalid';
    END IF;

    INSERT INTO public.attachments (id, note_id, user_id, name, type, size, storage_path, url, created_at)
    VALUES (
      v_attachment->>'id', v_note_id, v_user_id, v_attachment->>'name', v_attachment->>'type',
      (v_attachment->>'size')::bigint, v_path, v_attachment->>'url', (v_attachment->>'created_at')::bigint
    );
  END LOOP;

  SELECT to_jsonb(n) INTO v_note FROM public.notes n WHERE n.id = v_note_id AND n.user_id = v_user_id;
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at, a.id), '[]'::jsonb)
    INTO v_attachments FROM public.attachments a WHERE a.note_id = v_note_id AND a.user_id = v_user_id;

  RETURN jsonb_build_object('status', 'saved', 'note', v_note, 'attachments', v_attachments);
END;
$$;

REVOKE ALL ON FUNCTION public.duplicate_note_with_attachments(text, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.duplicate_note_with_attachments(text, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.duplicate_note_with_attachments(text, jsonb, jsonb) TO authenticated;
