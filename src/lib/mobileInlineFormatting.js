const INLINE_FORMATS = {
  bold: { command: 'bold', selector: 'b,strong', tag: 'strong' },
  italic: { command: 'italic', selector: 'i,em', tag: 'em' },
  underline: { command: 'underline', selector: 'u', tag: 'u' },
  strikeThrough: { command: 'strikeThrough', selector: 's,strike,del', tag: 's' },
};

const isInsideFormat = (node, editor, selector) => {
  const element = node instanceof Element ? node : node?.parentElement;
  const format = element?.closest(selector);
  return Boolean(format && editor.contains(format));
};

export function isInlineFormatActiveAtNode(editor, node, formatId) {
  const format = INLINE_FORMATS[formatId];
  return Boolean(format && isInsideFormat(node, editor, format.selector));
}

/** True only when every selected text segment already has the requested mark. */
export function isInlineFormatAppliedToRange(editor, range, formatId) {
  const format = INLINE_FORMATS[formatId];
  if (!format || range.collapsed) return false;
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let foundText = false;
  let node;
  while ((node = walker.nextNode())) {
    const textNode = node;
    const nodeRange = document.createRange();
    nodeRange.selectNodeContents(textNode);
    if (!range.intersectsNode(textNode)) continue;
    const intersection = range.cloneRange();
    if (range.compareBoundaryPoints(Range.START_TO_START, nodeRange) > 0) {
      intersection.setStart(range.startContainer, range.startOffset);
    } else {
      intersection.setStart(textNode, 0);
    }
    if (range.compareBoundaryPoints(Range.END_TO_END, nodeRange) < 0) {
      intersection.setEnd(range.endContainer, range.endOffset);
    } else {
      intersection.setEnd(textNode, textNode.length);
    }
    if (!intersection.toString().length) continue;
    foundText = true;
    if (!isInsideFormat(textNode, editor, format.selector)) return false;
  }
  return foundText;
}

const unwrapFormatNodes = (root, selector) => {
  const matching = [];
  if (root instanceof Element && root.matches(selector)) matching.push(root);
  matching.push(...root.querySelectorAll(selector));
  for (const element of matching.reverse()) {
    const parent = element.parentNode;
    if (!parent) continue;
    while (element.firstChild) parent.insertBefore(element.firstChild, element);
    parent.removeChild(element);
  }
};

/** Remove just one inline mark from the selected content, preserving other marks. */
export function removeInlineFormatFromRange(editor, range, formatId, selection) {
  const format = INLINE_FORMATS[formatId];
  if (!format || range.collapsed || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return false;
  const fragment = range.extractContents();
  if (!fragment.firstChild) return false;
  unwrapFormatNodes(fragment, format.selector);
  const first = fragment.firstChild;
  const last = fragment.lastChild;
  if (!first || !last) return false;
  range.insertNode(fragment);
  const restored = document.createRange();
  restored.setStartBefore(first);
  restored.setEndAfter(last);
  selection.removeAllRanges();
  selection.addRange(restored);
  return true;
}

/** Apply a mark only to the selected text segments that do not already have it. */
export function applyInlineFormatToRange(editor, range, formatId, selection) {
  const format = INLINE_FORMATS[formatId];
  if (!format || range.collapsed || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return false;
  const fragment = range.extractContents();
  const first = fragment.firstChild;
  const last = fragment.lastChild;
  if (!first || !last) return false;
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let textNode;
  while ((textNode = walker.nextNode())) textNodes.push(textNode);
  for (const text of textNodes) {
    if (!text.parentNode || isInsideFormat(text, fragment, format.selector)) continue;
    const wrapper = document.createElement(format.tag);
    text.replaceWith(wrapper);
    wrapper.append(text);
  }
  range.insertNode(fragment);
  const restored = document.createRange();
  restored.setStartBefore(first);
  restored.setEndAfter(last);
  selection.removeAllRanges();
  selection.addRange(restored);
  return textNodes.length > 0;
}

/** Place the caret in/out of a semantic wrapper so subsequent typing follows it. */
export function toggleCollapsedInlineFormat(editor, range, formatId, selection) {
  const format = INLINE_FORMATS[formatId];
  if (!format || !range.collapsed || !editor.contains(range.startContainer)) return false;
  let element = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  let activeWrapper = element?.closest(format.selector);
  if (activeWrapper && editor.contains(activeWrapper)) {
    let outerMatch = activeWrapper.parentElement;
    while (outerMatch && editor.contains(outerMatch)) {
      if (outerMatch.matches(format.selector)) activeWrapper = outerMatch;
      outerMatch = outerMatch.parentElement;
    }
    const parent = activeWrapper.parentNode;
    if (!parent) return false;
    if (range.startContainer === activeWrapper && activeWrapper.childNodes.length) {
      const adjacent = activeWrapper.childNodes[range.startOffset] ?? activeWrapper.childNodes[range.startOffset - 1];
      if (adjacent) element = adjacent instanceof Element ? adjacent : adjacent.parentElement;
    }
    const nestedMarks = [];
    let nested = element;
    while (nested && nested !== activeWrapper) {
      if (nested instanceof HTMLElement && nested.matches('b,strong,i,em,u,s,strike,del') && !nested.matches(format.selector)) {
        nestedMarks.unshift(nested);
      }
      nested = nested.parentElement;
    }
    const tail = range.cloneRange();
    tail.setEnd(activeWrapper, activeWrapper.childNodes.length);
    const trailingContent = tail.extractContents();
    let rightWrapper = null;
    if (trailingContent.childNodes.length) {
      rightWrapper = activeWrapper.cloneNode(false);
      rightWrapper.append(trailingContent);
      parent.insertBefore(rightWrapper, activeWrapper.nextSibling);
    }
    const nextSibling = rightWrapper ?? activeWrapper.nextSibling;
    if (!activeWrapper.textContent && !activeWrapper.querySelector('br,img,[data-noted-attachment-id]')) {
      activeWrapper.remove();
    }
    let caretContainer = null;
    if (nestedMarks.length) {
      let bridge = null;
      for (const mark of nestedMarks) {
        const clone = mark.cloneNode(false);
        if (bridge) bridge.append(clone);
        else bridge = clone;
        caretContainer = clone;
      }
      if (bridge) {
        parent.insertBefore(bridge, nextSibling?.parentNode === parent ? nextSibling : null);
        if (!nextSibling && activeWrapper.parentNode === parent) activeWrapper.after(bridge);
      }
    } else {
      // A caret immediately beside an inline mark can inherit that mark in some
      // contenteditable implementations. Keep it in a neutral, transient span.
      caretContainer = document.createElement('span');
      caretContainer.dataset.noteInlineCaretBoundary = 'true';
      if (nextSibling?.parentNode === parent) parent.insertBefore(caretContainer, nextSibling);
      else if (activeWrapper.parentNode === parent) activeWrapper.after(caretContainer);
      else parent.append(caretContainer);
    }
    const caret = document.createRange();
    caret.selectNodeContents(caretContainer);
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);
    return true;
  }

  const wrapper = document.createElement(format.tag);
  range.insertNode(wrapper);
  const caret = document.createRange();
  caret.selectNodeContents(wrapper);
  caret.collapse(true);
  selection.removeAllRanges();
  selection.addRange(caret);
  return true;
}

/** Drop transient empty marks from serialized HTML without touching the live caret. */
export function removeEmptyInlineFormats(root) {
  for (const boundary of root.querySelectorAll('[data-note-inline-caret-boundary]')) {
    while (boundary.firstChild) boundary.before(boundary.firstChild);
    boundary.remove();
  }
  for (const element of root.querySelectorAll('b,strong,i,em,u,s,strike,del')) {
    if (!element.textContent && !element.querySelector('br,img,[data-noted-attachment-id]')) element.remove();
  }
  return root.innerHTML;
}
