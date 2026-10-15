export interface ImageResizeInput {
  startWidth: number;
  startHeight: number;
  deltaX: number;
  deltaY: number;
  handle: string;
  preserveAspectRatio: boolean;
  maxWidth: number;
  minWidth?: number;
  minHeight?: number;
}
export interface ImageResizeResult { width: number; height: number; offsetX: number; offsetY: number; }
export function calculateImageResize(input: ImageResizeInput): ImageResizeResult;
