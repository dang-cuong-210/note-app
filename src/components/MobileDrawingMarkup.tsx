import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Eraser, Pen, Redo2, Trash2, Undo2, X } from 'lucide-react';
import { appendDrawingOperation, hasVisibleCanvasPixels, redoDrawingOperation, undoDrawingOperation, type DrawingOperation, type DrawingPoint } from '@/lib/drawingHistory.js';

const COLORS = [
  { name: 'Đen', value: '#25211f' },
  { name: 'Đỏ', value: '#c9434d' },
  { name: 'Xanh dương', value: '#3578bd' },
  { name: 'Xanh lá', value: '#4d8b59' },
  { name: 'Cam', value: '#d98245' },
];
const WIDTHS = [2, 5, 10];

interface MobileDrawingMarkupProps {
  onCancel: () => void;
  onDone: (image: File) => void;
  onBlankDone: () => void;
}

export function MobileDrawingMarkup({ onCancel, onDone, onBlankDone }: MobileDrawingMarkupProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const operationsRef = useRef<DrawingOperation[]>([]);
  const redoRef = useRef<DrawingOperation[]>([]);
  const activeRef = useRef<{ pointerId: number; operation: DrawingOperation } | null>(null);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [width, setWidth] = useState(5);
  const [color, setColor] = useState(COLORS[0].value);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const drawOperation = useCallback((context: CanvasRenderingContext2D, operation: DrawingOperation, canvas: HTMLCanvasElement) => {
    const points = operation.points;
    if (operation.tool === 'clear') {
      context.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if (!points.length) return;
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    context.save();
    context.globalCompositeOperation = operation.tool === 'eraser' ? 'destination-out' : 'source-over';
    context.strokeStyle = operation.color;
    context.fillStyle = operation.color;
    context.lineWidth = operation.width * scale;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    if (points.length === 1) {
      context.beginPath();
      context.arc(points[0].x * canvas.width, points[0].y * canvas.height, operation.width * scale / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.beginPath();
      context.moveTo(points[0].x * canvas.width, points[0].y * canvas.height);
      for (const point of points.slice(1)) context.lineTo(point.x * canvas.width, point.y * canvas.height);
      context.stroke();
    }
    context.restore();
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    operationsRef.current.forEach(operation => drawOperation(context, operation, canvas));
    if (activeRef.current) drawOperation(context, activeRef.current.operation, canvas);
    setCanUndo(operationsRef.current.length > 0);
    setCanRedo(redoRef.current.length > 0);
  }, [drawOperation]);

  useEffect(() => {
    const surface = surfaceRef.current;
    const canvas = canvasRef.current;
    if (!surface || !canvas) return;
    const resize = () => {
      const bounds = surface.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(bounds.width * ratio);
      canvas.height = Math.round(bounds.height * ratio);
      redraw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    resize();
    return () => observer.disconnect();
  }, [redraw]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): DrawingPoint => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const operation: DrawingOperation = { tool, color, width, points: [pointFromEvent(event)] };
    activeRef.current = { pointerId: event.pointerId, operation };
    const context = event.currentTarget.getContext('2d');
    if (context) drawOperation(context, operation, event.currentTarget);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    const next = pointFromEvent(event);
    const points = active.operation.points;
    const previous = points[points.length - 1];
    points.push(next);
    const canvas = event.currentTarget;
    const context = canvas.getContext('2d');
    if (!context) return;
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    context.save();
    context.globalCompositeOperation = active.operation.tool === 'eraser' ? 'destination-out' : 'source-over';
    context.strokeStyle = active.operation.color;
    context.lineWidth = active.operation.width * scale;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(previous.x * canvas.width, previous.y * canvas.height);
    context.lineTo(next.x * canvas.width, next.y * canvas.height);
    context.stroke();
    context.restore();
  };

  const finishPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    activeRef.current = null;
    operationsRef.current = appendDrawingOperation(operationsRef.current, active.operation);
    redoRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  };

  const undo = () => {
    const next = undoDrawingOperation(operationsRef.current, redoRef.current);
    operationsRef.current = next.operations;
    redoRef.current = next.redoOperations;
    redraw();
  };

  const redo = () => {
    const next = redoDrawingOperation(operationsRef.current, redoRef.current);
    operationsRef.current = next.operations;
    redoRef.current = next.redoOperations;
    redraw();
  };

  const clear = () => {
    operationsRef.current = appendDrawingOperation(operationsRef.current, { tool: 'clear', color: '', width: 0, points: [] });
    redoRef.current = [];
    redraw();
    setConfirmClear(false);
  };

  const handleDone = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !hasVisibleCanvasPixels(context.getImageData(0, 0, canvas.width, canvas.height))) {
      onBlankDone();
      return;
    }
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportContext = exportCanvas.getContext('2d');
    if (!exportContext) return;
    exportContext.fillStyle = '#fff';
    exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    exportContext.drawImage(canvas, 0, 0);
    exportCanvas.toBlob(blob => {
      if (!blob) return;
      onDone(new File([blob], `tanooki-drawing-${Date.now()}.png`, { type: 'image/png' }));
    }, 'image/png');
  };

  const requestCancel = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context && hasVisibleCanvasPixels(context.getImageData(0, 0, canvas.width, canvas.height))) setConfirmDiscard(true);
    else onCancel();
  };

  return <div className="tanooki-drawing-overlay" role="dialog" aria-modal="true" aria-label="Vẽ và đánh dấu">
    <header className="tanooki-drawing-header">
      <button type="button" onClick={requestCancel} aria-label="Hủy vẽ"><X size={21} /><span>Hủy</span></button>
      <strong>Vẽ</strong>
      <button type="button" className="tanooki-drawing-done" onClick={handleDone}><Check size={18} /><span>Xong</span></button>
    </header>
    <div ref={surfaceRef} className="tanooki-drawing-surface">
      <canvas ref={canvasRef} aria-label="Khung vẽ" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finishPointer} onPointerCancel={finishPointer} />
    </div>
    <div className="tanooki-drawing-controls">
      <div className="tanooki-drawing-control-row" aria-label="Công cụ vẽ">
        <button type="button" className={tool === 'pen' ? 'is-selected' : ''} onClick={() => setTool('pen')} aria-pressed={tool === 'pen'} aria-label="Bút"><Pen size={19} /></button>
        <button type="button" className={tool === 'eraser' ? 'is-selected' : ''} onClick={() => setTool('eraser')} aria-pressed={tool === 'eraser'} aria-label="Tẩy"><Eraser size={19} /></button>
        {WIDTHS.map((value, index) => <button type="button" key={value} className={`tanooki-drawing-width ${width === value ? 'is-selected' : ''}`} onClick={() => setWidth(value)} aria-pressed={width === value} aria-label={`Nét ${['mảnh', 'vừa', 'đậm'][index]}`}><span style={{ width: value + 3, height: value + 3 }} /></button>)}
        <button type="button" onClick={undo} disabled={!canUndo} aria-label="Hoàn tác nét vẽ"><Undo2 size={19} /></button>
        <button type="button" onClick={redo} disabled={!canRedo} aria-label="Làm lại nét vẽ"><Redo2 size={19} /></button>
        <button type="button" onClick={() => setConfirmClear(true)} disabled={!canUndo} aria-label="Xóa toàn bộ hình vẽ"><Trash2 size={18} /></button>
      </div>
      <div className="tanooki-drawing-color-row" aria-label="Màu bút">
        {COLORS.map(item => <button type="button" key={item.value} className={color === item.value ? 'is-selected' : ''} onClick={() => { setColor(item.value); setTool('pen'); }} aria-label={item.name} aria-pressed={color === item.value}><span style={{ backgroundColor: item.value }} /></button>)}
      </div>
    </div>
    {(confirmClear || confirmDiscard) && <div className="tanooki-drawing-confirm" role="alertdialog" aria-modal="true" aria-label={confirmClear ? 'Xóa hình vẽ?' : 'Bỏ hình vẽ?'}>
      <div><strong>{confirmClear ? 'Xóa toàn bộ hình vẽ?' : 'Bỏ hình vẽ?'}</strong><p>{confirmClear ? 'Có thể hoàn tác thao tác này.' : 'Các nét vẽ chưa lưu sẽ bị mất.'}</p><div>
        <button type="button" onClick={() => { setConfirmClear(false); setConfirmDiscard(false); }}>Tiếp tục vẽ</button>
        <button type="button" onClick={() => { if (confirmClear) clear(); else onCancel(); }}>{confirmClear ? 'Xóa' : 'Bỏ'}</button>
      </div></div>
    </div>}
  </div>;
}
