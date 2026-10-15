export const MAX_DRAWING_HISTORY = 50;

export function appendDrawingOperation(operations, operation, limit = MAX_DRAWING_HISTORY) {
  return [...operations, operation].slice(-limit);
}

export function undoDrawingOperation(operations, redoOperations) {
  if (!operations.length) return { operations, redoOperations };
  return {
    operations: operations.slice(0, -1),
    redoOperations: [...redoOperations, operations[operations.length - 1]],
  };
}

export function redoDrawingOperation(operations, redoOperations, limit = MAX_DRAWING_HISTORY) {
  if (!redoOperations.length) return { operations, redoOperations };
  return {
    operations: appendDrawingOperation(operations, redoOperations[redoOperations.length - 1], limit),
    redoOperations: redoOperations.slice(0, -1),
  };
}

export function hasVisibleCanvasPixels(imageData) {
  for (let alpha = 3; alpha < imageData.data.length; alpha += 4) {
    if (imageData.data[alpha] > 0) return true;
  }
  return false;
}
