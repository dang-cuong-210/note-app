export type DrawingPoint = { x: number; y: number };
export type DrawingOperation = {
  tool: 'pen' | 'eraser' | 'clear';
  color: string;
  width: number;
  points: DrawingPoint[];
};
export const MAX_DRAWING_HISTORY: number;
export function appendDrawingOperation<T>(operations: T[], operation: T, limit?: number): T[];
export function undoDrawingOperation<T>(operations: T[], redoOperations: T[]): { operations: T[]; redoOperations: T[] };
export function redoDrawingOperation<T>(operations: T[], redoOperations: T[], limit?: number): { operations: T[]; redoOperations: T[] };
export function hasVisibleCanvasPixels(imageData: ImageData): boolean;
