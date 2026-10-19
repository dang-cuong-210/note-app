# Independent media duplication manual test

Run these checks against an authenticated test account after applying the migration:

1. Create a note with an inline image, duplicate it, permanently delete the original, then verify the duplicate image still loads.
2. Create a note with a PDF attachment, duplicate it, permanently delete the original, then verify the duplicate PDF opens.
3. Rename the duplicate attachment and verify the original attachment name is unchanged.
4. Delete the duplicate attachment and verify the original attachment still opens.
5. Create a note with Drawing / Markup output, duplicate it, delete the original, then verify the duplicate drawing remains visible.
6. Go offline and duplicate a media-containing note. Verify the app reports that a connection is required and creates no duplicate.

The automated tests cover path/ID rewriting, cleanup targeting, and the transactional RPC contract. The checks above require authenticated Supabase Storage and are intentionally manual.
