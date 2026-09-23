/*
# Create attachments table for note file attachments

## Purpose
Stores metadata for non-image file attachments (PDF, TXT, DOC, DOCX, XLS, XLSX,
PPT, PPTX, ZIP, etc.) linked to notes. Image attachments continue to be embedded
directly in note content HTML; this table is for generic file attachments that
need separate metadata tracking.

## New Tables
- `attachments`
  - `id` (text, primary key) — client-generated unique ID
  - `note_id` (text, not null) — FK to notes.id, cascades on delete
  - `user_id` (uuid, not null, defaults to auth.uid()) — owner
  - `name` (text, not null) — original file name
  - `type` (text, not null) — MIME type
  - `size` (bigint, not null) — file size in bytes
  - `storage_path` (text, not null) — path in Supabase Storage
  - `url` (text) — signed URL for access
  - `created_at` (bigint, not null) — creation timestamp (epoch ms)

## Security
- Enable RLS on `attachments`.
- Owner-scoped CRUD: each authenticated user can only access their own attachments.
- Storage bucket `note-files` created with same owner-scoped policies as `note-images`.
*/

CREATE TABLE IF NOT EXISTS attachments (
  id text PRIMARY KEY,
  note_id text NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  size bigint NOT NULL,
  storage_path text NOT NULL,
  url text,
  created_at bigint NOT NULL
);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_attachments" ON attachments;
CREATE POLICY "select_own_attachments" ON attachments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_attachments" ON attachments;
CREATE POLICY "insert_own_attachments" ON attachments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_attachments" ON attachments;
CREATE POLICY "update_own_attachments" ON attachments
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_attachments" ON attachments;
CREATE POLICY "delete_own_attachments" ON attachments
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Storage bucket for generic file attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('note-files', 'note-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "select_own_note_files" ON storage.objects;
CREATE POLICY "select_own_note_files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'note-files' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "insert_own_note_files" ON storage.objects;
CREATE POLICY "insert_own_note_files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'note-files' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "update_own_note_files" ON storage.objects;
CREATE POLICY "update_own_note_files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'note-files' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'note-files' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "delete_own_note_files" ON storage.objects;
CREATE POLICY "delete_own_note_files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'note-files' AND (storage.foldername(name))[1] = auth.uid()::text);
