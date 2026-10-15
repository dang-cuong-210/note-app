export type ImageInsertionSide = 'before' | 'after';
export function getImageInsertionSide(clientY: number, top: number, bottom: number): ImageInsertionSide;
export function isTapPlacement(startX: number, startY: number, endX: number, endY: number, maxDistance?: number): boolean;
