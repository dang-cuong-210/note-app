# Foundation Hardening Pass #2

Starting branch: `feat/sync-safety`; HEAD: `49ddf3bde8a902578986dd415c855b76d7fb8321`.

## Policy (defined before implementation)

Folder changes use a separate durable account-scoped operation queue and server
CAS. Create expects -1; rename/parent changes expect the last confirmed revision.
Deletes are terminal server tombstones, not physical row deletion: a lost CREATE
response retried after a remote delete must never recreate the same ID. Every new
legitimate folder uses a new ID. An operation ID makes retries idempotent.

On conflict retain the pending local operation and show an explicit notice. Do not
automatically overwrite the server or change note.folderId. User choices are to
keep the server version, or preserve a conflicting local save as a **new, empty**
folder marked “(conflict copy)”; notes keep their original folder associations.
A conflicting delete can be explicitly retried against the displayed server
revision. Further concurrent writes cause another conflict, never a blind delete.

Keep pending operations over snapshots/Realtime. Missing cached rows without a
pending operation are pruned by successful snapshots; cached rows are never
inferred to be new creates. Legacy unmarked offline edits cannot be distinguished
from stale cache; back them up before upgrading. No automatic legacy-folder upload.

New write RPC uses SECURITY DEFINER with a fixed search_path and explicit auth.uid
ownership checks, because direct authenticated table writes must be revoked to
prevent bypassing CAS. Owner-only RLS SELECT is unchanged; no broad privileges or
PUBLIC/anon RPC execution. Only folder write access changes. This intentionally
requires upgrading old clients; old unconditional folder writes fail safely.

Notes leave a locally deleted folder through the existing saveNote CAS path.
Folder RPC never modifies notes, never adds an FK, and never deletes note contents.
Failure of folder deletion retains the folder tombstone and the safe note updates.

## Implementation and merge rules

IndexedDB v4 adds `user-folder-sync`, keyed by account + folder ID with an account
index. Each record holds the last observed remote version, optional pending
operation (unique operation ID, save/delete, full local metadata, expected revision,
conflict flag), and a local observation stamp. A read/modify/write transaction
updates this record store and the existing folder display cache atomically.
Acknowledgements clear only the matching operation; a later queued edit or delete
survives. Accepted cache writes finish for their original account even after logout;
disposed sessions cannot publish UI or enqueue late callbacks.

There is no folder save debounce to cancel anymore. Local intent is persisted first,
then flush reads current durable intent before sending; save followed by delete
supersedes the save. Failed calls retain work. Initial load, reconnect, channel join,
page-hide flush and a 5-second online retry flush the queue. Folder networking runs
alongside note flushing rather than blocking note RPCs. Pending conflict operations
are not retried blindly. The RPC verifies both auth.uid() and the originally queued
account, protecting a request racing with account changes.

| Incoming data | Result |
| --- | --- |
| Cloud row, no pending op | Accept highest observed revision; cache the confirmed row. |
| Pending save/create | Keep local metadata and original expected revision, then CAS. |
| Pending delete | Hide locally; retain tombstone until server confirmation or explicit user cancellation. |
| Matching operation acknowledgement | Clear only that operation; do not clear a newer queued operation. |
| Successful snapshot missing an unmarked cached row | Prune it; never infer a CREATE. |
| Event arrives after snapshot starts | Its observation stamp prevents the older snapshot from undoing it. |
| Server tombstone | Hide confirmed state; acknowledge pending deletes; conflicting saves remain available for explicit resolution. |

The existing authenticated, `user_id`-filtered folder channel remains. INSERT/UPDATE
now reconcile revisions and pending work. Normal folder deletion is an UPDATE with
`deleted=true`; physical DELETE is also handled, including unknown IDs arriving
during a snapshot. A terminal deleted ID cannot be restored by an older live event.
Attachment reconciliation and note CAS/conflict-copy/permanent-delete code paths
are unchanged. Folder UI failures/conflicts have a small persistent notice; the
existing opt-in Realtime diagnostics remain available.

## Migration and rollout

Created `supabase/migrations/20261003020000_folder_cas_and_tombstones.sql`.
It adds `revision`, `deleted` and `last_operation` to folders; existing rows start at
revision 0 and remain visible. `write_folder_versioned` serializes operations on an
ID, conditionally creates/updates, and preserves deletion tombstones, including for
never-uploaded IDs. It rejects unauthenticated/account-mismatched calls and does not
return another owner's row. A fixed `pg_catalog, pg_temp` search path and explicitly
qualified tables/functions limit SECURITY DEFINER scope. See PostgreSQL's
[security-definer guidance](https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY).

The migration runs transactionally, is idempotent, revokes direct folder writes from
PUBLIC/anon/authenticated, and exposes only the guarded RPC to authenticated users.
It preserves owner-only RLS policies, folder FULL replica identity, existing
publication membership, attachment migrations and note RPC definition. Service-role
administration remains privileged. Never purge server tombstones while old clients
or pending operations might still exist.

**Not applied to the hosted Noted Supabase project.** Applied twice only to a new,
in-memory PGlite PostgreSQL test database, with disposable roles/accounts/data. No
live Supabase admin connection was available. Hosted schema and additional grants
remain unverified.

Manual rollout (no production deployment was performed):

1. Back up any outstanding folder edits in old clients; they have no durable
   operation marker. Close all old Noted tabs/PWAs before upgrading IndexedDB. An old
   open v3 tab can block the v4 upgrade; close it and reload the new client.
2. Confirm the intended Supabase project. Record folder policies, table privileges,
   publication members and the existing `save_note_versioned` definition.
3. Review and apply only this migration deliberately. Verify the new RPC's
   SECURITY DEFINER/search_path and execute ACLs; `has_table_privilege` for
   authenticated folder INSERT/UPDATE/DELETE must be false, SELECT must remain true.
   Check owner RLS, notes RPC definition and all publication members are unchanged.
4. Use the matching new client in a controlled preview. Old clients' unconditional
   folder writes now fail safely; do not mix old-client writes into acceptance tests.
5. With disposable data, verify two real owner sessions and a separate account:
   offline create/rename/delete, full PWA restart, simultaneous rename, delete versus
   rename, reconnect, and conflict resolution. Confirm only owner events arrive and
   notes remain accessible. Preserve existing user notes throughout.

Without the migration, the new client retains folder operations locally and reports
RPC failure; it never falls back to an unconditional upsert/delete.

## Tests and validation

- `npm ci`: passed, lockfile unchanged. Existing audit still reports 21 vulnerabilities
  (3 low, 5 moderate, 13 high); no dependency updates were made.
- `npm test`: 33 tests passed (14 attachment regressions + 19 folder scenarios).
  The production operation queue is executed, not mocked. The injected transport
  is simulated in these tests.
- Folder cases include offline create/rename/delete and restart, save then delete,
  stale save callbacks, remote UPDATE/DELETE while pending, two-device rename,
  delete/rename races, account switches, snapshot races, failed/lost RPC responses,
  stale unmarked cache, delete during in-flight create, late CREATE after server
  deletion, same-account tab acknowledgements, logout during persistence and an
  unknown DELETE followed by a stale INSERT, and a stale UI revision racing a newer cached version.
- `tests/folderCache.browser.mjs`: all 19 queue cases passed using real Edge IndexedDB,
  plus actual page reload recovery and a v3-to-v4 upgrade preserving a pending note.
- `tests/editorRealtime.browser.mjs`: passed with the real React hook/editor/cache.
  Verified attachment regression; folder RPC failure still moves notes through
  `save_note_versioned` at the expected revision, retains content and durable delete
  intent; clicked both server-version and conflict-copy notice actions and verified
  note locations remain unchanged by resolution. The hook also passed an actual
  A/logout/B/A transition in the same browser context: B saw neither A's folders
  nor notes, and A's pending folder rename recovered on return. Supabase transport was mocked.
- `tests/attachmentCache.browser.mjs`: passed; account isolation and metadata
  deletion remain intact. No page errors in the browser checks.
- `tests/folderMigration.postgres.mjs`: actual SQL migration applied twice in PGlite;
  CAS, idempotent retry, terminal tombstones, stale CREATE/rename rejection, direct
  write rejection, anonymous/foreign-account denial, owner SELECT isolation,
  publication/policy preservation and existing note CAS verified. PGlite is
  single-connection: this does not establish hosted multi-connection locking or
  Supabase Realtime delivery.
- `npm run typecheck`, `npm run lint`: passed.
- `npm run build`: attempted; blocked by the same Windows native esbuild config-loader
  `Access is denied` error as Pass #1. Equivalent production Vite API build passed
  with the same React plugin/source alias/optimization exclusion (1,660 modules).
  Rerun the normal build in CI or an unrestricted development checkout.

Optional browser/SQL tests require separately available Playwright + a browser and
`@electric-sql/pglite`; this session used external tool runtimes through `NODE_PATH`.
Neither runtime was added to application dependencies or its lockfile. Use
`PLAYWRIGHT_CHANNEL=msedge` for installed Edge. Commands:

```sh
npm test
node tests/folderCache.browser.mjs
node tests/editorRealtime.browser.mjs
node tests/attachmentCache.browser.mjs
node tests/folderMigration.postgres.mjs
node --input-type=module -e "import {build} from 'vite'; import react from '@vitejs/plugin-react'; import path from 'node:path'; await build({configFile:false,plugins:[react()],resolve:{alias:{'@':path.resolve('src')}},optimizeDeps:{exclude:['lucide-react']}});"
```

## Changed files and remaining limits

Application: `src/App.tsx`, `src/components/FolderSyncNotice.tsx`,
`src/hooks/useAppData.ts`, `src/lib/folderSync.ts`, `src/lib/db.ts`, `src/types.ts`.
Migration: `supabase/migrations/20261003020000_folder_cas_and_tombstones.sql`.
Tests: `tests/folderSync.test.mjs`, `tests/folderScenarios.mjs`,
`tests/folderCache.browser.mjs`, `tests/folderMigration.postgres.mjs`,
`tests/browser/editor.fixture.mjs`, `tests/browser/supabase.mock.mjs`,
`tests/editorRealtime.browser.mjs`. Report: this file.

Live Supabase delivery/authentication, genuine two-connection database races,
Safari/iPhone PWA suspension and storage eviction still require manual testing.
Browser tests used disposable Edge contexts; no real user profile/data was touched.
No browser app can guarantee durability if storage rejects a transaction, is
evicted, or the process dies before the transaction commits; failures are surfaced.

Conflict copies intentionally do not relocate notes. Cancelling a pending folder
deletion does not undo note moves already saved through note CAS. Notes created
elsewhere/offline with a now-deleted folder ID remain visible in All Notes; this
pass does not rewrite unseen note relationships or add a foreign key. Parent IDs
are preserved; the current sidebar lists folders flat. No service worker, media
behavior, note persistence model or attachment migration was changed.
