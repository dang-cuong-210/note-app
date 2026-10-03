// Optional isolated PostgreSQL/WASM check; provide @electric-sql/pglite through
// NODE_PATH or an external test runtime. Never connects to a hosted database.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const { PGlite } = createRequire(import.meta.url)('@electric-sql/pglite');
const db = new PGlite();
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const migration = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO authenticated, anon;
    INSERT INTO auth.users VALUES ('${a}'), ('${b}');
  `);
  await db.exec(await migration('20260921201942_create_notes_folders_tables.sql'));
  await db.exec(await migration('20260926010000_add_note_revision_cas.sql'));
  await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes, public.folders TO authenticated;
    CREATE PUBLICATION supabase_realtime FOR TABLE public.notes, public.folders;`);
  const noteDefinition = (await db.query("select pg_get_functiondef('public.save_note_versioned(jsonb,bigint)'::regprocedure) as definition")).rows;
  const policies = (await db.query("select policyname, qual, with_check from pg_policies where tablename = 'folders' order by policyname")).rows;
  const sql = await migration('20261003020000_folder_cas_and_tombstones.sql');
  await db.exec(sql);
  await db.exec(sql); // Idempotence, including permission changes.
  assert.deepEqual((await db.query("select pg_get_functiondef('public.save_note_versioned(jsonb,bigint)'::regprocedure) as definition")).rows, noteDefinition);
  assert.deepEqual((await db.query("select policyname, qual, with_check from pg_policies where tablename = 'folders' order by policyname")).rows, policies);
  assert.deepEqual((await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename")).rows,
    [{ tablename: 'folders' }, { tablename: 'notes' }]);
  assert.equal((await db.query("select relreplident from pg_class where oid='public.folders'::regclass")).rows[0].relreplident, 'f');
  await db.exec('SET ROLE authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [a]);
  const rpc = async (id, name, revision, operation, remove = false, account = a) =>
    (await db.query('select public.write_folder_versioned($1::uuid,$2::jsonb,$3::bigint,$4::text,$5::boolean) as result',
      [account, JSON.stringify({ id, name, parent_id: null, created_at: 1 }), revision, operation, remove])).rows[0].result;
  const created = await rpc('folder', 'original', -1, 'create');
  assert.equal(created.status, 'saved'); assert.equal(created.folder.revision, 0);
  assert.equal((await rpc('folder', 'original', -1, 'create')).folder.revision, 0);
  assert.equal((await rpc('folder', 'duplicate', -1, 'duplicate-create')).status, 'conflict');
  const results = await Promise.all([
    rpc('folder', 'device A', 0, 'rename-A'), rpc('folder', 'device B', 0, 'rename-B'),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), ['conflict', 'saved']);
  assert.equal((await rpc('folder', 'stale delete', 0, 'delete-old', true)).status, 'conflict');
  assert.equal((await rpc('folder', 'delete', 1, 'delete', true)).status, 'deleted');
  assert.equal((await rpc('folder', 'resurrect rename', 1, 'stale')).status, 'conflict');
  assert.equal((await rpc('folder', 'resurrect create', -1, 'create')).status, 'conflict');
  assert.equal((await rpc('folder', 'delete retry', 1, 'delete', true)).status, 'deleted');
  assert.equal((await rpc('never-created', 'cancelled', -1, 'cancel', true)).status, 'deleted');
  assert.equal((await rpc('never-created', 'late create', -1, 'late')).status, 'conflict');
  // Direct legacy writes cannot bypass revision checks or delete tombstones.
  await assert.rejects(db.exec("UPDATE public.folders SET name='bypass'"), /permission denied/);
  await assert.rejects(db.exec("DELETE FROM public.folders"), /permission denied/);
  await assert.rejects(db.exec("INSERT INTO public.folders(id,name) VALUES('bypass','bypass')"), /permission denied/);
  // Existing note RPC and RLS remain usable, and stale note CAS still conflicts.
  const note = { id: 'note', title: 'retained', content: '<p>safe</p>', folder_id: 'folder' };
  assert.equal((await db.query('select save_note_versioned($1::jsonb,-1) as result', [JSON.stringify(note)])).rows[0].result.status, 'saved');
  assert.equal((await db.query('select save_note_versioned($1::jsonb,1) as result', [JSON.stringify({ ...note, folder_id: null })])).rows[0].result.status, 'saved');
  assert.equal((await db.query('select save_note_versioned($1::jsonb,1) as result', [JSON.stringify(note)])).rows[0].result.status, 'conflict');
  assert.equal((await db.query("select content from notes where id='note'")).rows[0].content, '<p>safe</p>');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [b]);
  assert.deepEqual((await db.query('select * from folders')).rows, []);
  const foreign = await rpc('folder', 'attack', -1, 'foreign', false, b);
  assert.equal(foreign.status, 'conflict'); assert.equal(foreign.folder, null);
  await assert.rejects(rpc('new-id', 'wrong-account', -1, 'wrong-account', false, a), /Account does not match/);
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(rpc('anon', 'anon', -1, 'anon'), /permission denied/);
  await db.exec('RESET ROLE; SET ROLE authenticated');
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await assert.rejects(rpc('no-session', 'no-session', -1, 'no-session'), /Account does not match/);
  console.log('PASS: actual migration twice; SQL CAS/idempotence/tombstones, role permissions, owner isolation, note CAS and publication/policy preservation. PGlite is single-connection; hosted concurrency/Realtime unverified.');
} finally { await db.close(); }
