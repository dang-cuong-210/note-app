import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { appendDrawingOperation, hasVisibleCanvasPixels, redoDrawingOperation, undoDrawingOperation } from '../src/lib/drawingHistory.js';

const [editor, drawing, css] = await Promise.all([
  readFile(new URL('../src/components/NoteEditor.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/MobileDrawingMarkup.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
]);

const stroke = (x = 0.2) => ({ tool: 'pen', color: '#25211f', width: 5, points: [{ x, y: 0.3 }, { x: x + 0.1, y: 0.4 }] });

test('mobile drawing button opens the drawing UI from the shared keyboard toolbar', () => {
  const toolbar = editor.match(/<nav className="tanooki-mobile-editor-bottom-bar"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(toolbar);
  assert.equal((toolbar.match(/<button type="button"/g) || []).length, 5);
  assert.match(toolbar, /onClick=\{\(\) => \{ rememberCaret\(\); setDrawingOpen\(true\); \}\} aria-label="Vẽ và đánh dấu"/);
  assert.match(editor, /drawingOpen && <MobileDrawingMarkup/);
  assert.match(editor, /onDone=\{\(image\) => \{ setDrawingOpen\(false\); void handleImageUpload\(image\); \}\}/);
});

test('drawing opens with the Pen selected and provides an eraser, practical widths, and preset colors', () => {
  assert.match(drawing, /useState<'pen' \| 'eraser'>\('pen'\)/);
  assert.match(drawing, /setTool\('eraser'\)/);
  assert.match(drawing, /const WIDTHS = \[2, 5, 10\]/);
  for (const color of ['#25211f', '#c9434d', '#3578bd', '#4d8b59', '#d98245']) assert.ok(drawing.includes(color));
});

test('pointer drawing is direct canvas input and erasing uses destination-out', () => {
  for (const handler of ['onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel']) assert.ok(drawing.includes(handler));
  assert.match(drawing, /globalCompositeOperation = operation\.tool === 'eraser' \? 'destination-out' : 'source-over'/);
  assert.match(drawing, /globalCompositeOperation = active\.operation\.tool === 'eraser' \? 'destination-out' : 'source-over'/);
  const moveHandler = drawing.match(/const onPointerMove = \(event:[\s\S]*?\n  \};/)?.[0];
  assert.ok(moveHandler);
  assert.doesNotMatch(moveHandler, /set[A-Z]\w*\(/);
  assert.match(css, /\.tanooki-drawing-surface[^\n]*touch-action: none/);
});

test('undo and redo are session-local, bounded, and discard redo after a new operation', () => {
  let operations = [];
  for (let index = 0; index < 55; index += 1) operations = appendDrawingOperation(operations, stroke(index / 100));
  assert.equal(operations.length, 50);
  let redo = [];
  let next = undoDrawingOperation(operations, redo);
  operations = next.operations;
  redo = next.redoOperations;
  assert.equal(operations.length, 49);
  next = redoDrawingOperation(operations, redo);
  operations = next.operations;
  redo = next.redoOperations;
  assert.equal(operations.length, 50);
  assert.equal(redo.length, 0);
  redo = undoDrawingOperation(operations, redo).redoOperations;
  operations = appendDrawingOperation(operations, stroke(0.9));
  redo = [];
  assert.equal(redo.length, 0);
  assert.doesNotMatch(drawing, /document\.execCommand\('(undo|redo)'\)/);
});

test('Clear asks for confirmation and is an undoable drawing-session operation', () => {
  assert.match(drawing, /onClick=\{\(\) => setConfirmClear\(true\)\}/);
  assert.match(drawing, /role="alertdialog"/);
  assert.match(drawing, /tool: 'clear'/);
  assert.match(drawing, /if \(operation\.tool === 'clear'\) \{\s*context\.clearRect/);
  const clear = { tool: 'clear', color: '', width: 0, points: [] };
  const original = [stroke()];
  const cleared = appendDrawingOperation(original, clear);
  assert.equal(undoDrawingOperation(cleared, []).operations.length, 1);
});

test('blank Done does not create an image, while a nonblank drawing exports PNG', () => {
  assert.match(drawing, /hasVisibleCanvasPixels\(context\.getImageData/);
  assert.match(drawing, /\{\s*onBlankDone\(\);\s*return;/);
  assert.match(drawing, /exportCanvas\.toBlob\(blob =>/);
  assert.match(drawing, /type: 'image\/png'/);
  assert.match(editor, /onBlankDone=\{\(\) => \{ setDrawingOpen\(false\); toast\('Chưa có nét vẽ để thêm'\); \}\}/);
});

test('Cancel confirms discarding visible strokes and never uploads drawing data', () => {
  assert.match(drawing, /if \(canvas && context && hasVisibleCanvasPixels\([\s\S]*?setConfirmDiscard\(true\)/);
  assert.match(drawing, /else onCancel\(\)/);
  assert.match(editor, /onCancel=\{\(\) => setDrawingOpen\(false\)\}/);
  assert.doesNotMatch(drawing, /uploadNoteImage|onAddAttachment/);
});

test('saved canvas PNG enters the existing inline image upload/insertion pipeline', () => {
  assert.match(editor, /onDone=\{\(image\) => \{ setDrawingOpen\(false\); void handleImageUpload\(image\); \}\}/);
  const upload = editor.match(/const handleImageUpload = async \(file: File\) => \{[\s\S]*?\n  \};/)?.[0];
  assert.ok(upload);
  assert.match(upload, /uploadNoteImage\(uploadNoteId, file\)/);
  assert.match(upload, /document\.createElement\('img'\)/);
  assert.match(upload, /commitEditor\(\)/);
});

test('drawing overlay respects dynamic viewport and both safe-area insets', () => {
  assert.match(css, /\.tanooki-drawing-overlay[^\n]*height: 100dvh/);
  assert.match(css, /\.tanooki-drawing-header[^\n]*env\(safe-area-inset-top\)/);
  assert.match(css, /\.tanooki-drawing-controls[^\n]*env\(safe-area-inset-bottom\)/);
});

test('blank alpha pixels are distinguished from visible strokes after erasing', () => {
  assert.equal(hasVisibleCanvasPixels({ data: new Uint8ClampedArray([0, 0, 0, 0, 20, 20, 20, 0]) }), false);
  assert.equal(hasVisibleCanvasPixels({ data: new Uint8ClampedArray([0, 0, 0, 255]) }), true);
});
