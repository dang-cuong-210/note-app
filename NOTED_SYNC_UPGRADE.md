# Noted: conditional note sync — experimental build

This archive extends `noted-safety-fixes.zip`. It is **not production-tested**.

## Changes

- IndexedDB notes, folders, attachments, and pending note drafts are keyed by authenticated account. Switching accounts immediately hides the prior account's state and clears its sync queues before loading the next account. Existing unscoped v2 stores are retained. They are imported only when matching cloud IDs or an owner-prefixed attachment path proves ownership; ambiguous offline-only records remain quarantined in the legacy stores rather than being exposed to another account.
- Theme, font-size, and sort settings remain intentionally device-wide because they contain no note or account content.
- Permanent deletion waits for any active note save, blocks later retries, confirms the Supabase note deletion, and only then removes local state and cleans up file/image storage. A failed database deletion leaves the note and its cache intact.
- Attachment bulk deletion now stops before storage cleanup if its database query or deletion fails.
- Conflict copies explicitly use revision `0` locally and expected revision `-1` for their first CAS write.
- Atomic compare-and-set note writes via Supabase RPC `save_note_versioned` with monotonically increasing `revision`.
- `useAppData` writes notes through RPC rather than unconditional `upsert` (except one-time legacy IndexedDB migration when the cloud is empty).
- Pending notes are marked in IndexedDB to survive browser restarts and offline sessions.
- Supabase Realtime cannot overwrite an unsynced local note or its IndexedDB draft.
- Concurrent same-note edits yield a separately named `(conflict copy)` note, preserving the local draft before loading the latest server note.
- Reconnect refetches server revisions before retrying pending edits.
- `visibilitychange` event listener is cleaned up and background flush now transmits only dirty notes, not every cached note.

## REQUIRED before using this version

1. Export a full backup of notes and files and retain the previous working deployment.
2. Close stale app tabs / installed PWA instances on all devices before migrating. Old clients still use unconditional writes and do not participate in CAS.
3. Run `supabase db push` or apply `supabase/migrations/20260926010000_add_note_revision_cas.sql` to your chosen project **before** deploying this client. Ensure database backups.
4. In Codespaces, run `npm ci`, `npm run typecheck`, `npm run build`, and `npm run lint`.
5. Test concurrent edits with two devices, offline edit + browser restart + reconnect, attachment rendering in conflict copies, and permanent note deletion under a simulated network failure.
6. Deploy to a separate Vercel preview; roll back if any check fails.

## Known limitations / next audit

- This uses the RPC on the *updated* app. Older clients can still use unconditional note writes; a coordinated rollout is required for full end-to-end protection.
- `migrateLocalData` retains a cautious legacy import path for pre-upgrade IndexedDB entries without a revision. Deleted old cached notes may be revived once during legacy migration; verify the backup before migration.
- Conflict copies duplicate note HTML but do not clone storage bytes or reassign legacy attachment metadata. Do **not** delete the original note before verifying images and inline file cards in the conflict copy.
- Permanently deleting a note currently starts cleanup before the server confirms the deletion. It also may leave attachment storage objects after DB cascade. This is next in the safety work and is **not** fixed in this archive.
- Full TypeScript typecheck/build, SQL execution against a real Supabase project, and real touch/device tests could not be completed here due to unavailable npm dependencies and database access. Successful TypeScript parsing is not a substitute.
- This codebase also still uses a browser-wide IndexedDB cache rather than a per-authenticated-user cache. Do not switch between different Supabase accounts in the same browser until account isolation is implemented and verified.
- The initial data-loading hook can start while authentication is still resolving. If first load has no valid session, a page reload after login may be needed; auth lifecycle is a separate priority fix.
