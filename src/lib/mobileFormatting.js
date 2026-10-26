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
