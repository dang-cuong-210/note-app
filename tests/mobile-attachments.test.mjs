import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [editor, sheets, css] = await Promise.all([
  readFile(new URL('../src/components/NoteEditor.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/MobileEditorSheets.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
]);

test('mobile paperclip opens the attachment sheet directly with exactly three picker actions', () => {
  assert.match(editor, /onClick=\{\(\) => setMobileSheet\('attachment-menu'\)\} aria-label="Đính kèm"/);
  const menu = sheets.match(/export function MobileAttachmentMenuSheet[\s\S]*?export interface MobileInlineImage/)?.[0] ?? '';
  assert.match(menu, /<MobileBottomSheet open=\{open\} title="Thêm tệp đính kèm"/);
  assert.match(menu, /Đính kèm tệp/);
  assert.match(menu, /Chọn ảnh hoặc video/);
  assert.match(menu, /Chụp ảnh hoặc video/);
  assert.doesNotMatch(menu, /Thư viện ảnh|Chụp ảnh hoặc quay video|Chọn tệp/);
  assert.equal((menu.match(/<MobileBottomSheet\b/g) ?? []).length, 1);
  assert.equal((menu.match(/<button type="button" onClick=\{\(\) => choose\(/g) ?? []).length, 3);
  assert.match(editor, /<MobileAttachmentMenuSheet open=\{mobileSheet === 'attachment-menu'\}/);
  assert.doesNotMatch(editor, /setMobileSheet\('attachment-browser'\)[\s\S]{0,100}onAttachFile/);
});

test('file, media and camera pickers reuse the existing file selection/upload handlers', () => {
  assert.match(editor, /ref=\{fileInputRef\}[\s\S]*?onChange=\{handleFileSelect\}/);
  assert.match(editor, /ref=\{mediaInputRef\} type="file" accept="image\/\*,video\/\*" multiple onChange=\{handleFileSelect\}/);
  assert.match(editor, /ref=\{captureInputRef\} type="file" accept="image\/\*,video\/\*" capture="environment" onChange=\{handleFileSelect\}/);
  assert.match(editor, /if \(file\.type\.startsWith\('image\/'\)\) \{\s*handleImageUpload\(file\);\s*\} else \{\s*handleFileUpload\(file\);/);
  assert.match(editor, /await onAddAttachment\(uploadNoteId, file\)/);
  assert.match(editor, /onCaptureMedia=\{\(\) => captureInputRef\.current\?\.click\(\)\}/);
  const menu = sheets.match(/export function MobileAttachmentMenuSheet[\s\S]*?export interface MobileInlineImage/)?.[0] ?? '';
  assert.match(menu, /choose\(onAttachFile\)/);
  assert.match(menu, /choose\(onChooseMedia\)/);
  assert.match(menu, /choose\(onCaptureMedia\)/);
  assert.match(menu, /const choose = \(action: \(\) => void\) => \{ onClose\(\); action\(\); \}/);
});

test('note-scoped attachment browser includes inline images and saved files with empty state and actions', () => {
  assert.match(editor, /setMobileInlineImages\(images\);\s*setMobileSheet\('attachment-browser'\)/);
  assert.match(editor, /attachments=\{attachments\} images=\{mobileInlineImages\}/);
  assert.match(sheets, /Chưa có tệp đính kèm/);
  assert.match(sheets, /onRename\(attachment\)/);
  assert.match(sheets, /onShare\(attachment\)/);
  assert.match(sheets, /onDelete\(attachment\)/);
  assert.match(sheets, /onOpen\(attachment\)/);
  assert.match(editor, /onDeleteImage=\{\(image\) => handleRemoveImage\(image\.src\)\}/);
  assert.match(editor, /onShowAttachments=\{handleShowAttachments\}/);
  assert.match(sheets, /onClick=\{\(\) => run\(onShowAttachments\)\}[^>]*><Paperclip/);
});

test('attachment sharing prefers native file sharing and falls back to a browser download/open', () => {
  assert.match(editor, /navigator\.share && navigator\.canShare/);
  assert.match(editor, /navigator\.canShare\(\{ files: \[file\] \}\)/);
  assert.match(editor, /link\.download = attachment\.name/);
  assert.match(editor, /window\.open\(url, '_blank', 'noopener,noreferrer'\)/);
});

test('uploads expose in-progress, completed and failed feedback without blocking editing', () => {
  assert.match(editor, /Đang tải \{uploadsInProgress\} tệp lên/);
  assert.match(editor, /toast\(`Đã đính kèm \$\{file\.name\}`\)/);
  assert.match(editor, /toast\('Không thể đính kèm tệp'\)/);
  assert.match(editor, /className="tanooki-mobile-upload-status" role="status" aria-live="polite"/);
});

test('mobile attachment sheet styles retain touch-sized controls and long-name truncation', () => {
  assert.match(css, /\.tanooki-mobile-attachment-actions > button \{ min-height: 54px;/);
  assert.match(css, /\.tanooki-mobile-attachment-meta strong \{ overflow: hidden;[\s\S]*text-overflow: ellipsis;/);
  assert.match(css, /\.tanooki-mobile-attachment-menu-popover button \{ display: flex; min-height: 42px;/);
  assert.match(css, /\.tanooki-mobile-attachment-empty/);
});
