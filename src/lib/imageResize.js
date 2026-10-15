export function calculateImageResize({ startWidth, startHeight, deltaX, deltaY, handle, preserveAspectRatio, maxWidth, minWidth = 72, minHeight = 48 }) {
  const safeWidth = Math.max(minWidth, startWidth);
  const safeHeight = Math.max(minHeight, startHeight);
  const ratio = safeWidth / safeHeight;
  const horizontal = handle.includes('e') || handle.includes('w');
  const vertical = handle.includes('n') || handle.includes('s');
  const widthDelta = handle.includes('w') ? -deltaX : deltaX;
  const heightDelta = handle.includes('n') ? -deltaY : deltaY;
  let width;
  let height;

  if (preserveAspectRatio) {
    let nextWidth;
    if (horizontal && vertical) {
      const verticalWidthDelta = heightDelta * ratio;
      nextWidth = safeWidth + (Math.abs(widthDelta) >= Math.abs(verticalWidthDelta) ? widthDelta : verticalWidthDelta);
    } else if (horizontal) nextWidth = safeWidth + widthDelta;
    else nextWidth = (safeHeight + heightDelta) * ratio;

    const maxScale = Math.max(1 / safeWidth, maxWidth / safeWidth);
    const minScale = Math.min(maxScale, Math.max(minWidth / safeWidth, minHeight / safeHeight));
    const scale = Math.max(minScale, Math.min(maxScale, nextWidth / safeWidth));
    width = safeWidth * scale;
    height = safeHeight * scale;
  } else {
    const effectiveMinWidth = Math.min(minWidth, maxWidth);
    width = Math.max(effectiveMinWidth, Math.min(maxWidth, safeWidth + (horizontal ? widthDelta : 0)));
    height = Math.max(minHeight, Math.min(4096, safeHeight + (vertical ? heightDelta : 0)));
  }

  width = Math.round(width * 100) / 100;
  height = Math.round(height * 100) / 100;
  return {
    width,
    height,
    offsetX: handle.includes('w') ? safeWidth - width : 0,
    offsetY: handle.includes('n') ? safeHeight - height : 0,
  };
}
