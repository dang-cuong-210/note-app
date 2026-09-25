# Noted incremental safety fixes (26 September 2026)

Based on the `noted-inline-attachments.zip` feature version, retaining the existing React/Supabase architecture.

1. **Cross-device conflict guard.** When a remote revision arrives for the open note and local unsaved edits diverge, autosave pauses and a user choice appears. A remote revision without local unsaved edits refreshes the editor. Switching notes/unmounting flushes non-conflicting pending edits. This is a client-side safeguard; the existing cloud write path still uses an unconditional upsert, so simultaneous writes that race before Realtime delivery are **not yet transactionally protected**. Full cross-device conflict safety requires an atomic database compare-and-set/version strategy.
2. **Non-destructive image editing/Undo.** Removing an image from contentEditable no longer immediately deletes the storage object. This prevents Undo from restoring broken image links. Images no longer referenced after an edit may remain in storage until the note is permanently deleted; future background garbage collection can be designed separately.
3. **Attachment deletion correctness.** Only remove the attachment from local cache after Supabase confirms the database deletion. A permissions/network failure now propagates so the UI can show failure, rather than silently showing success. Storage removal failure after DB deletion is still logged as an orphan cleanup warning.
4. **Image drag.** Preserve a pointer's image target on long press and use it at pointer-move/end time, avoiding dependence on asynchronous React selection state.
5. **Image insertion at cursor.** Uploaded images now use the saved caret when possible, like inline file cards. If the user switches notes while upload is running, its unused storage object is cleaned up rather than inserted into the next note.

## Validation

- All 20 source TypeScript/TSX files parse and transpile using TypeScript 5.8.3.
- 8 static regression checks pass via `verify.mjs` (outside project archive).
- Full typecheck/build and real iPhone touch tests **not verified**: dependencies cannot be installed offline (missing npm cache package `yocto-queue`).

## Deployment

Do not upload these changes to production until `npm ci`, `npm run typecheck`, `npm run build`, and touch/manual syncing checks have passed in Codespaces. No new Supabase migration is required for these fixes.
