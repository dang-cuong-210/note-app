# Noted: inline media editing draft

Source: `feat/note-keyboard-shortcuts` at commit `8da6230de72cdf55bfe16045c2e87a971d95f2b3`.

Modified: `src/App.tsx`, `src/components/NoteEditor.tsx`, `src/hooks/useAppData.ts`, `src/index.css`.

- Removed the redundant hamburger from the mobile note editor. The note-list hamburger, editor Back button and desktop sidebar remain.
- Long-press an image to select it. Context toolbar: drag/move in the note flow, aspect-ratio/free resize with eight handles, preview with pinch zoom, duplicate and confirm-before-delete. Dragging an image to a text position rearranges its place in the note's HTML. Dimensions persist in the image's inline style.
- Long-press a file card to show its contextual toolbar. Drag a selected card to reorder it in the attachment list, resize card width with its handle or +/- buttons, open, rename, or confirm-before-delete. Up/down controls provide a fallback on touch devices.
- Attachment order and card widths are stored in a non-visible HTML comment alongside the note content, so the existing note synchronization transfers them without a schema migration. The file bytes and Supabase Storage paths are unaffected by layout changes. Rename changes only the attachment display name in the existing `attachments` table.

## Scope and known limits

- **New in the inline-layout build:** newly uploaded files are inserted at the last editing caret, directly among paragraphs. Legacy file cards appear in an unplaced-files tray with an **Insert at cursor** button. Long-press an embedded card to move it to a text position, resize it, open, rename, unlink (without deleting storage), or delete the file. The inline node's attachment ID and width are saved in note HTML and synced by the existing notes table without a migration.
- Files are flow-ordered between text runs/paragraphs, not absolutely positioned over text. On other screen sizes they reflow rather than cover surrounding writing.
- Image movement is reordering within the note's **document flow**, not arbitrary pixel-absolute positioning. This avoids clipping and makes the saved notes responsive on PC and iPhone.
- Browser/iPhone gesture behavior, Supabase synchronization and production runtime have **not** been independently verified in this workspace. Test long-press/drag, resize, two-finger gestures, loading/saving across devices and file rename/delete on a disposable note before deployment.
- The ZIP has no Git metadata, no browser session and no Supabase secrets. The existing deployed Vercel site has **not** been modified.

## Run before deploying

```bash
npm ci
npm run typecheck
npm run build
```

Do not deploy over real notes without testing with a disposable note and checking syncing from PC to iPhone and back.
