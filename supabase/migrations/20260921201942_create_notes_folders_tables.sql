/*
# Create notes and folders tables with user-scoped RLS

## Purpose
Enables cross-device sync for the Noted PWA. Each authenticated user
owns their notes and folders privately. Data is isolated per user via
Row Level Security policies keyed on auth.uid().

## New Tables

### folders
- id (uuid, primary key) — client-generated, matches local IndexedDB IDs
- user_id (uuid, not null, defaults to auth.uid()) — owner
- name (text, not null)
- parent_id (uuid, nullable) — for optional nesting
- created_at (bigint) — epoch milliseconds, matches client timestamps

### notes
- id (uuid, primary key) — client-generated, matches local IndexedDB IDs
- user_id (uuid, not null, defaults to auth.uid()) — owner
- title (text, not null, default '')
- content (text, not null, default '') — HTML content
- folder_id (uuid, nullable) — reference to folders
- pinned (boolean, default false)
- archived (boolean, default false)
- trashed (boolean, default false)
- trashed_at (bigint, nullable)
- created_at (bigint) — epoch milliseconds
- updated_at (bigint) — epoch milliseconds

## Security
- RLS enabled on both tables.
- Four CRUD policies per table, scoped TO authenticated, ownership via auth.uid() = user_id.
- user_id columns default to auth.uid() so client inserts without user_id still satisfy WITH CHECK.

## Notes
- IDs are client-generated UUIDs (text-based) so offline creation works seamlessly.
- Timestamps use bigint (epoch ms) to match the existing client data model.
- No foreign key on notes.folder_id to allow flexible folder operations.
- CASCADE delete on user_id references auth.users for cleanup.
*/

CREATE TABLE IF NOT EXISTS folders (
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  parent_id text,
  created_at bigint NOT NULL DEFAULT 0
);

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_folders" ON folders;
CREATE POLICY "select_own_folders" ON folders FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_folders" ON folders;
CREATE POLICY "insert_own_folders" ON folders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_folders" ON folders;
CREATE POLICY "update_own_folders" ON folders FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_folders" ON folders;
CREATE POLICY "delete_own_folders" ON folders FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS notes (
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  folder_id text,
  pinned boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  trashed boolean NOT NULL DEFAULT false,
  trashed_at bigint,
  created_at bigint NOT NULL DEFAULT 0,
  updated_at bigint NOT NULL DEFAULT 0
);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notes" ON notes;
CREATE POLICY "select_own_notes" ON notes FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_notes" ON notes;
CREATE POLICY "insert_own_notes" ON notes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_notes" ON notes;
CREATE POLICY "update_own_notes" ON notes FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_notes" ON notes;
CREATE POLICY "delete_own_notes" ON notes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id);
