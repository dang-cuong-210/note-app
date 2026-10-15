import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateImageResize } from '../src/lib/imageResize.js';

const [editor, css] = await Promise.all([
  readFile(new URL('../src/components/NoteEditor.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
]);

const base = { startWidth: 240, startHeight: 160, deltaX: 0, deltaY: 0, preserveAspectRatio: true, maxWidth: 600 };

test('all eight resize handles keep the image ratio and clamp to positive dimensions', () => {
  for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
    const result = calculateImageResize({ ...base, handle, deltaX: handle.includes('e') ? 35 : handle.includes('w') ? -35 : 0, deltaY: handle.includes('s') ? 25 : handle.includes('n') ? -25 : 0 });
    assert.ok(result.width >= 72 && result.height >= 48, `${handle} dimensions must stay usable`);
    assert.ok(Math.abs(result.width / result.height - 1.5) < 0.01, `${handle} preserves the image ratio`);
  }
});

test('west and north handles keep their opposite anchor stable', () => {
  const west = calculateImageResize({ ...base, handle: 'w', deltaX: -40, deltaY: 0 });
  assert.equal(west.width, 280);
  assert.equal(west.offsetX, -40);
  const north = calculateImageResize({ ...base, handle: 'n', deltaX: 0, deltaY: -30 });
  assert.equal(north.height, 190);
  assert.equal(north.offsetY, -30);
  const northWest = calculateImageResize({ ...base, handle: 'nw', deltaX: -40, deltaY: -30 });
  assert.equal(northWest.offsetX, base.startWidth - northWest.width);
  assert.equal(northWest.offsetY, base.startHeight - northWest.height);
});

test('free resize adjusts axes independently and bounds invalid sizes', () => {
  const free = calculateImageResize({ ...base, handle: 'se', deltaX: 30, deltaY: -200, preserveAspectRatio: false });
  assert.equal(free.width, 270);
  assert.equal(free.height, 48);
  const capped = calculateImageResize({ ...base, handle: 'e', deltaX: 999, deltaY: 0, maxWidth: 300 });
  assert.equal(capped.width, 300);
  const edgeBounded = calculateImageResize({ ...base, handle: 'w', deltaX: 300, deltaY: 0, maxWidth: 42 });
  assert.equal(edgeBounded.width, 42);
  assert.ok(edgeBounded.width > 0 && edgeBounded.height > 0);
});

test('resize pointermove only records the latest point and schedules at most one frame', () => {
  const move = editor.match(/onPointerMove=\{e => \{\s*const g = imageGesture\.current;[\s\S]*?\n            \}\}/)?.[0];
  assert.ok(move);
  const mobilePath = move.match(/g\.latestX = e\.clientX;[\s\S]*?queueImageGestureFrame\(g\);/)?.[0];
  assert.ok(mobilePath);
  assert.match(mobilePath, /g\.latestY = e\.clientY/);
  assert.doesNotMatch(mobilePath, /setState|setImageFrame|getBoundingClientRect|commitEditor/);
  assert.match(editor, /if \(gesture\.frame == null\) gesture\.frame = requestAnimationFrame/);
});

test('resize writes image and selection visuals directly per frame, then commits only at gesture end', () => {
  const frame = editor.match(/const renderImageGestureFrame = \(gesture: ImageGesture\) => \{([\s\S]*?)\n  \};/)?.[1];
  assert.ok(frame);
  assert.match(frame, /const img = gesture\.target;[\s\S]*?img\.style\.width/);
  assert.match(frame, /style\.marginLeft/);
  assert.match(frame, /style\.marginTop/);
  assert.match(frame, /updateImageOverlayFrame/);
  assert.doesNotMatch(frame, /set[A-Z]\w*\(|getBoundingClientRect/);
  const finish = editor.match(/const finishImageGesture = \([\s\S]*?\n  \};/)?.[0];
  assert.ok(finish);
  assert.match(finish, /if \(gesture\.frame != null\) cancelAnimationFrame/);
  assert.match(finish, /cancelled \|\| !moved/);
  assert.match(finish, /commitEditor\(\)/);
  assert.match(finish, /setImageFrame\(gesture\.target\.getBoundingClientRect\(\)\)/);
});

test('pinch resize and desktop image reordering preserve pointer capture and rAF drag rendering', () => {
  assert.match(editor, /cancelEditorDrag\(\);\s*cancelImageGesture\(\);\s*e\.currentTarget\.setPointerCapture\(e\.pointerId\);\s*const \[a, b\][\s\S]*?imageGesture\.current = createImageGesture\(img, 'pinch'/);
  assert.match(editor, /g\.latestDistance = Math\.hypot/);
  assert.match(editor, /if \(desktopPresentation\) resizeImageLegacy\(g\.target, g\.w \* g\.latestDistance/);
  assert.match(editor, /session\.ghost!\.style\.transform = `translate3d/);
  assert.match(editor, /session\.active && session\.frame == null\) \{\s*session\.frame = requestAnimationFrame/);
  assert.match(editor, /if \(session\.surface\.hasPointerCapture\(session\.pointerId\)\) session\.surface\.releasePointerCapture/);
});

test('selected mobile image uses immediate pointer capture and direct rAF translation, without the drag ghost path', () => {
  const down = editor.match(/const onImagePointerDown = \(e: React\.PointerEvent<HTMLDivElement>\) => \{([\s\S]*?)\n  \};/)?.[1];
  assert.ok(down);
  assert.match(down, /if \(!desktopPresentation\)[\s\S]*?selectedImage !== img\) return;[\s\S]*?setPointerCapture\(e\.pointerId\)[\s\S]*?createImageGesture\(img, 'move'/);
  assert.match(down, /gesture\.dropBoundaries = collectDropBoundaries\(img, true\)/);
  const mobileBranch = down.match(/if \(!desktopPresentation\) \{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(mobileBranch);
  assert.doesNotMatch(mobileBranch, /armEditorDrag|ghost|setTimeout/);
  assert.match(down, /armEditorDrag\(e, img, 'image'\);/);
  const move = editor.match(/const onImagePointerMove = \(e: React\.PointerEvent<HTMLDivElement>\) => \{([\s\S]*?)\n  \};/)?.[1];
  assert.ok(move);
  assert.match(move, /g\?\.mode === 'move'[\s\S]*?Math\.hypot\([^;]*\) >= 3[\s\S]*?queueImageGestureFrame\(g\)/);
  assert.doesNotMatch(move, /commitEditor\(\)|insertBefore|setImageFrame/);
  assert.match(editor, /gesture\.target\.style\.transform = `translate3d\(\$\{deltaX\}px, \$\{deltaY\}px, 0\)/);
});

test('mobile image move commits one final DOM reorder and pointercancel restores the transient transform', () => {
  const finish = editor.match(/const finishImageGesture = \([\s\S]*?\n  \};/)?.[0];
  assert.ok(finish);
  assert.match(finish, /gesture\.dropBoundaries\.reduce/);
  assert.match(finish, /boundary\.parent\.insertBefore\(source, boundary\.before\)/);
  assert.match(finish, /if \(didMove \|\|[\s\S]*?commitEditor\(\)/);
  assert.match(finish, /cancelled \|\| !moved[\s\S]*?gesture\.target\.style\.transform = gesture\.inlineTransform/);
  assert.match(editor, /onLostPointerCapture=\{e => \{\s*if \(imageGesture\.current\?\.mode === 'move'\) finishImageGesture\(e, true\);/);
});

test('mobile normal editor scrolling remains available outside selected images and move toolbar is not a touch blocker', () => {
  assert.match(css, /\.note-content img \{[\s\S]*?touch-action: pan-y/);
  assert.match(css, /\.note-content img\.noted-image-selected \{[\s\S]*?touch-action: none/);
  assert.match(css, /\.noted-image-toolbar \{ pointer-events: none; \}\s*\.noted-image-toolbar button \{ pointer-events: auto; \}/);
  const down = editor.match(/const onImagePointerDown = \(e: React\.PointerEvent<HTMLDivElement>\) => \{([\s\S]*?)\n  \};/)?.[1];
  assert.ok(down);
  assert.match(down, /if \(!desktopPresentation\) \{[\s\S]*?return;[\s\S]*?\n    \}[\s\S]*?armEditorDrag\(e, img, 'image'\)/);
});

test('image frame is refined while retaining 32px transparent targets around compact visible handles', () => {
  assert.match(css, /\.noted-image-outline-calm[^\n]*border-width: 1px/);
  assert.match(css, /\.noted-image-handle-touch[^\{]*\{[^}]*width: 32px;[^}]*height: 32px;[^}]*background: transparent/);
  assert.match(css, /\.noted-image-handle-touch::after[^\{]*\{[^}]*width: 11px;[^}]*height: 11px/);
  const handle = css.match(/\.noted-image-handle-touch \{([^}]*)\}/)?.[1];
  assert.ok(handle);
  assert.match(handle, /touch-action: none/);
});

test('resize pointercancel restores original inline image geometry and gesture state stays outside saved note HTML', () => {
  assert.match(editor, /onPointerCancel=\{e => \{ e\.stopPropagation\(\); e\.currentTarget\.dataset\.active = 'false'; if \(desktopPresentation\) imageGesture\.current = null; else finishImageGesture\(e, true\); \}\}/);
  assert.match(editor, /gesture\.target\.style\.width = gesture\.inlineWidth/);
  assert.match(editor, /gesture\.target\.style\.height = gesture\.inlineHeight/);
  assert.match(editor, /const html = withLayout\(writeManagedTags\(editorRef\.current\.innerHTML/);
  assert.doesNotMatch(editor, /data-noted-active-image|noted-selected-image/);
});
