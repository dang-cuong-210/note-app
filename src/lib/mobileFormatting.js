export const MOBILE_FORMATTING_GROUPS = [
  {
    label: 'Văn bản',
    actions: [
      { id: 'bold', label: 'B', name: 'In đậm', command: 'bold' },
      { id: 'italic', label: 'I', name: 'In nghiêng', command: 'italic' },
      { id: 'underline', label: 'U', name: 'Gạch chân', command: 'underline' },
      { id: 'strikeThrough', label: 'S', name: 'Gạch ngang', command: 'strikeThrough' },
    ],
  },
  {
    label: 'Tiêu đề',
    actions: [
      { id: 'heading1', label: 'H1', name: 'Tiêu đề 1', command: 'formatBlock', value: '<h1>' },
      { id: 'heading2', label: 'H2', name: 'Tiêu đề 2', command: 'formatBlock', value: '<h2>' },
      { id: 'heading3', label: 'H3', name: 'Tiêu đề 3', command: 'formatBlock', value: '<h3>' },
    ],
  },
  {
    label: 'Danh sách',
    actions: [
      { id: 'insertUnorderedList', label: '• Danh sách', name: 'Danh sách dấu đầu dòng', command: 'insertUnorderedList' },
      { id: 'insertOrderedList', label: '1. Danh sách', name: 'Danh sách đánh số', command: 'insertOrderedList' },
      { id: 'checklist', label: '☑ Checklist', name: 'Checklist', command: 'checklist' },
    ],
  },
  {
    label: 'Khối',
    actions: [
      { id: 'quote', label: '❝ Trích dẫn', name: 'Trích dẫn', command: 'formatBlock', value: '<blockquote>' },
      { id: 'code', label: '{ } Code', name: 'Khối mã', command: 'formatBlock', value: '<pre>' },
    ],
  },
];

export function setChecklistItemChecked(item, checked) {
  const value = Boolean(checked);
  item.setAttribute('data-checked', String(value));
  item.setAttribute('aria-checked', String(value));
  return value;
}

export function normalizeChecklistItem(item) {
  item.dataset.checklistItem = 'true';
  const checked = item.dataset.checked === 'true';
  item.setAttribute('role', 'checkbox');
  item.setAttribute('aria-keyshortcuts', 'Control+Space Meta+Space');
  setChecklistItemChecked(item, checked);
}

export function normalizeChecklistRows(list) {
  for (const item of Array.from(list.children)) {
    if (item.tagName === 'LI') normalizeChecklistItem(item);
  }
}

// Removes checklist formatting from only the selected LI. When the item is in
// the middle of a checklist, split the list around its new paragraph so the
// remaining rows retain native checklist semantics.
export function removeChecklistFromItem(item) {
  const list = item.parentElement;
  if (!list || list.tagName !== 'UL' || !list.hasAttribute('data-checklist')) return false;

  const siblings = Array.from(list.children);
  const itemIndex = siblings.indexOf(item);
  if (itemIndex < 0) return false;
  const hasPrevious = itemIndex > 0;
  const hasFollowing = itemIndex < siblings.length - 1;
  const paragraph = item.ownerDocument.createElement('p');
  const selection = item.ownerDocument.getSelection?.();
  const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;

  while (item.firstChild) paragraph.append(item.firstChild);
  if (!paragraph.childNodes.length) paragraph.append(item.ownerDocument.createElement('br'));

  item.removeAttribute('data-checklist-item');
  item.removeAttribute('data-checked');
  item.removeAttribute('role');
  item.removeAttribute('aria-checked');
  item.removeAttribute('aria-keyshortcuts');

  let trailingList = null;
  if (hasPrevious && hasFollowing) {
    trailingList = list.cloneNode(false);
    while (item.nextSibling) trailingList.append(item.nextSibling);
  }
  item.remove();

  if (!hasPrevious && !hasFollowing) {
    list.replaceWith(paragraph);
  } else if (!hasPrevious) {
    list.before(paragraph);
  } else {
    list.after(paragraph);
    if (trailingList) paragraph.after(trailingList);
  }

  // Most browser carets point into a text node, which remains connected as its
  // parent moves. Also map LI-boundary ranges into the corresponding P boundary.
  if (range && selection) {
    if (range.startContainer === item) range.setStart(paragraph, Math.min(range.startOffset, paragraph.childNodes.length));
    if (range.endContainer === item) range.setEnd(paragraph, Math.min(range.endOffset, paragraph.childNodes.length));
    if (paragraph.contains(range.startContainer) && paragraph.contains(range.endContainer)) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  return true;
}
