export function getImageInsertionSide(clientY, top, bottom) {
  return clientY < top + (bottom - top) / 2 ? 'before' : 'after';
}

export function isTapPlacement(startX, startY, endX, endY, maxDistance = 10) {
  return Math.hypot(Number(endX) - Number(startX), Number(endY) - Number(startY)) <= maxDistance;
}
