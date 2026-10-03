# Foundation Hardening Pass #1

## Baseline and scope

Verified a writable checkout of `dang-cuong-210/note-app`, branch
`feat/sync-safety`, at `d36e88fb4ca468951293767a2b2a405ec7acf371`.
The initial working tree was clean. No main-branch changes or deployment commands
are part of this pass. No user notes, Storage objects, credentials or live database
configuration were changed during testing.

## Attachment gap and fix

`useAppData` previously subscribed only to notes and folders. Attachment metadata
was loaded by SELECT, so a remote note could reference a file absent from local
state indefinitely. A later SELECT also replaced attachment state wholesale;
adding a subscription alone would leave a race with in-flight refreshes. Failed
attachment queries previously returned an empty array, incorrectly treating a
network failure as an authoritative empty result.

The attachment channel now joins after the existing validated session and awaited
`realtime.setAuth` path, with `user_id=eq.<account>` filtering. Owner INSERT/UPDATE
upsert metadata, DELETE removes only metadata from state and that account's cache.
The receiving path has no Storage operations. A per-account reconciler deduplicates
events, overlays mutations on pending snapshots, rejects older refresh responses,
guards late local confirmations/account disposal, and serializes cache writes.
Successful scoped snapshots prune records for deletes missed while disconnected.
Each attachment SUBSCRIBED/reconnect triggers its own reconciliation.

The existing editor already rehydrates inline cards as attachment props change.
Both event orders were tested with the real hook and editor. One presentation-only
line restores the normal tooltip after metadata arrives; otherwise a recovered
card retained “File unavailable”. No editor persistence, CAS/conflict behavior,
media gestures, service worker or folder synchronization was redesigned.

The opt-in `?rtdebug=1` panel now includes attachment channel status/error and last
event type/time.

## Database status and required manual verification

**Live configuration is unknown and unchanged.** No connected Supabase admin
capability or project credentials were available. Repository migrations establish
owner-only attachment CRUD RLS, publish notes/folders, and set their replica
identity to FULL; they did not publish attachments or set attachment identity FULL.
This is repository evidence, not a claim about the hosted database.

Added `supabase/migrations/20261003010000_enable_attachments_realtime.sql`, not
applied. It adds only `public.attachments` if absent from `supabase_realtime` and
sets its replica identity FULL. Existing publication members and RLS policies are
not replaced. FULL retains `user_id` in deleted-row WAL for server-side filtering;
the client also rejects an explicitly foreign owner and tolerates a primary-key-only
DELETE payload from the filtered channel. See the current
[Supabase Postgres Changes documentation](https://supabase.com/docs/guides/realtime/postgres-changes).

In the **correct Noted Supabase project's SQL Editor**, record these results before
applying the new migration, then rerun the same queries afterward:

```sql
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by schemaname, tablename;

select relname, relreplident, relrowsecurity
from pg_class
where oid in ('public.notes'::regclass, 'public.folders'::regclass,
              'public.attachments'::regclass);

select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'attachments';
```

Apply **only the new migration** after reviewing the baseline. Expected result:
attachments included, `relreplident = 'f'`, RLS still enabled, attachment policies
unchanged, and every existing publication member retained. Avoid blindly applying
all pending migrations with a CLI command to an unverified project.

Then use disposable notes/files in two sessions of owner A and a separate account
B. With `?rtdebug=1`, confirm A's second session receives attachment INSERT, rename
UPDATE and DELETE without reload; account B must receive none of A's events.
Repeat after disconnect/reconnect and with both note/metadata event orders. Check
the receiver does not make a Storage delete request. Do not use existing notes for
this exercise. Hosted delivery, JWT/RLS authorization and real PC/iPhone behavior
remain **unverified** until this test is performed.

## Accidental UI artifacts

- `NoteList.tsx`: corrected the contaminated `bg-appcurl -I ...` class to `bg-app`.
- `NoteList.tsx`: removed one duplicated mobile-search wrapper and its closing tag.
- `Sidebar.tsx`: removed the duplicate consecutive `onClose?.()` call.

No sidebar/search redesign or hamburger-navigation change belongs to this pass.

## Folder offline audit (no folder fixes applied)

| Scenario | Verified code behavior and risk |
| --- | --- |
| Offline create, then reconnect | `saveFolder` writes local cache and schedules one best-effort upsert. Failures are logged, not durably queued. A local-only folder survives the cloud merge but normally is not retried, so it can remain device-only. The initial migration has a special cloud-empty path; it is not general retry protection. |
| Offline rename, then reconnect | Local rename is cached, but cloud wins for the same ID in `loadFromCloud`, so the offline rename can be lost. |
| Offline delete, then reconnect | Local row is removed; failed cloud deletion has no durable tombstone/retry. The cloud row can reappear on reconnect. `removeFolder` also does not cancel an already scheduled folder upsert, allowing a later upsert to recreate a deleted row. |
| Concurrent devices | Folder upserts have no revision/CAS guard or conflict preservation. Last accepted write wins; a stale upsert can recreate a deleted folder. |

`flushAll` clears folder debounce timers but flushes only pending **notes**. Hiding
the page during the folder debounce window can therefore cancel the sole pending
folder upload. These findings follow the save/delete/merge/flush code; they were
not reproduced against the hosted database or fixed speculatively here.

Pass #2 should add an account-scoped durable folder operation queue, including
delete tombstones and explicit acknowledgements; replay it on reconnect/load and
flush without dropping pending work; and overlay pending operations while merging
cloud snapshots. Cancel/supersede older saves on delete and keep tombstones until
server confirmation. Define folder revision/CAS and conflict policy before adding
any migration, including delete-vs-rename and child/note relationships. Test restart
while offline, interrupted flushes, retry failures, two-device conflicts and account
switches. Preserve the existing note CAS system independently.

## Validation and limitations

- `npm ci`: passed; lockfile unchanged. Existing audit output reports 21 dependency
  vulnerabilities (3 low, 5 moderate, 13 high). No dependency upgrades in this pass.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: 14/14 passed, covering event mapping/deduplication, foreign-owner
  rejection, snapshot ordering, late local responses, reconnect pruning, cache
  failures, disposal, accepted writes across account lifetimes and permanent-note-deletion guards.
- `node tests/attachmentCache.browser.mjs`: passed with headless Edge and real
  IndexedDB in an ephemeral browser context. Tested insert/rename/delete, snapshot
  pruning and isolation of records with the same ID in different account stores.
- `node tests/editorRealtime.browser.mjs`: passed with the real React hook, editor
  and IndexedDB, using a mocked Supabase transport. Verified setAuth-before-channel,
  account filter, both event orders in separate React updates, rename, recovered
  tooltip and receiver-delete UI. No page errors. Mock Storage throws if called.
- Browser scripts need a separately available `playwright` package/browser; use
  `PLAYWRIGHT_CHANNEL=msedge` when using installed Edge. This environment resolved
  Playwright through its bundled runtime (`NODE_PATH`); no new dependency was added.
- `npm run build`: attempted but blocked in native esbuild's Vite-config loader by
  Windows `Access is denied` while enumerating `C:\Users\User`. Explicit read grants
  did not resolve it. This command must be rerun in a normal checkout/CI.
- Equivalent Vite production build via the JS API passed (1,658 modules) with the
  same React plugin, source alias and optimization exclusion, bypassing only native
  config bundling. Reproducible fallback:

```sh
node --input-type=module -e "import {build} from 'vite'; import react from '@vitejs/plugin-react'; import path from 'node:path'; await build({configFile:false,plugins:[react()],resolve:{alias:{'@':path.resolve('src')}},optimizeDeps:{exclude:['lucide-react']}});"
```

The build had no Supabase environment values in this checkout; a successful bundle
does not verify a configured login session. Live Supabase events, RLS isolation,
file upload/download/Storage deletion, existing note CAS conflict scenarios and
real iPhone interactions were not exercised. The tests never contacted live
Supabase or edited user data. `git diff --check` passed. File-scope review excluded
`.env`, `node_modules`, build output and `supabase/.temp` from the change set.
