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

// Converts exactly one focused block (or one LI from a regular list) into a
// checklist row. The source block's children move intact, preserving inline DOM.
export function convertBlockToChecklist(block) {
  const parent = block.parentElement;
  if (!parent) return false;
  const doc = block.ownerDocument;
  const selection = doc.getSelection?.();
  const focusNode = selection?.focusNode;
  const focusOffset = selection?.focusOffset ?? 0;
  const focusIsInsideBlock = focusNode === block || Boolean(focusNode && block.contains(focusNode));
  const sourceList = block.tagName === 'LI' ? parent : null;
  const siblings = sourceList ? Array.from(sourceList.children) : [];
  const itemIndex = sourceList ? siblings.indexOf(block) : -1;
  if (sourceList && (itemIndex < 0 || !/^(UL|OL)$/.test(sourceList.tagName) || sourceList.hasAttribute('data-checklist'))) return false;
  const checklist = doc.createElement('ul');
  checklist.setAttribute('data-checklist', 'true');
  const item = doc.createElement('li');
  normalizeChecklistItem(item);
  while (block.firstChild) item.append(block.firstChild);
  if (!item.childNodes.length) item.append(doc.createElement('br'));
  checklist.append(item);

  if (block.tagName !== 'LI') {
    block.replaceWith(checklist);
  } else {
    const hasPrevious = itemIndex > 0;
    const hasFollowing = itemIndex < siblings.length - 1;
    let trailingList = null;
    if (hasPrevious && hasFollowing) {
      trailingList = sourceList.cloneNode(false);
      if (sourceList.tagName === 'OL') {
        const reversed = sourceList.hasAttribute('reversed');
        let nextNumber = Number.parseInt(sourceList.getAttribute('start') || (reversed ? String(siblings.length) : '1'), 10);
        for (const previousItem of siblings.slice(0, itemIndex + 1)) {
          const explicitValue = Number.parseInt(previousItem.getAttribute('value') || '', 10);
          if (Number.isFinite(explicitValue)) nextNumber = explicitValue;
          nextNumber += reversed ? -1 : 1;
        }
        trailingList.setAttribute('start', String(nextNumber));
      }
      while (block.nextSibling) trailingList.append(block.nextSibling);
    }
    block.remove();
    if (!hasPrevious && !hasFollowing) sourceList.replaceWith(checklist);
    else if (!hasPrevious) sourceList.before(checklist);
    else {
      sourceList.after(checklist);
      if (trailingList) checklist.after(trailingList);
    }
  }

  if (focusIsInsideBlock && selection) {
    const range = doc.createRange();
    if (focusNode === block) range.setStart(item, Math.min(focusOffset, item.childNodes.length));
    else range.setStart(focusNode, Math.min(focusOffset, focusNode.nodeType === 3 ? focusNode.textContent.length : focusNode.childNodes.length));
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  return true;
}
