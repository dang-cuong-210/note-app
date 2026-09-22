/*
# Create note-images storage bucket for image attachments

## Purpose
Enables per-user image storage for note attachments. Images are stored in
Supabase Storage (not in the database or localStorage) and referenced by
URL in note content HTML. Each authenticated user gets a private folder
path: `note-images/<user_id>/<note_id>/<image_id>.<ext>`.

## Storage Bucket
- `note-images` — private bucket, only accessible to authenticated owners
- Path convention: `<user_id>/<note_id>/<filename>` — user-scoped isolation

## Policies
- SELECT (read): authenticated users can read objects in their own user_id prefix
- INSERT (upload): authenticated users can upload to their own user_id prefix
- UPDATE: authenticated users can update objects in their own user_id prefix
- DELETE: authenticated users can delete objects in their own user_id prefix

## Notes
- The bucket is created as private (not public) so image access requires auth.
- Storage policies use the path token matching: storage.foldername(name) extracts
  the first path segment (user_id), which must match auth.uid().
- No database table needed for images — image URLs are embedded directly in
  note content HTML as <img src="..."> tags, and images are cleaned up when
  a note is permanently deleted.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('note-images', 'note-images', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for storage.objects in the note-images bucket
DROP POLICY IF EXISTS "select_own_note_images" ON storage.objects;
CREATE POLICY "select_own_note_images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'note-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "insert_own_note_images" ON storage.objects;
CREATE POLICY "insert_own_note_images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'note-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "update_own_note_images" ON storage.objects;
CREATE POLICY "update_own_note_images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'note-images' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'note-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "delete_own_note_images" ON storage.objects;
CREATE POLICY "delete_own_note_images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'note-images' AND (storage.foldername(name))[1] = auth.uid()::text);
