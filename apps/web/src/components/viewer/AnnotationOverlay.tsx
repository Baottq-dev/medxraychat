'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useViewerStore } from '@/stores';
import type { Annotation, Point } from '@/types';

interface AnnotationOverlayProps {
  pixelSpacing?: [number, number]; // mm per pixel [row, column]
  className?: string;
}

type DragMode = 'none' | 'move' | 'resize';
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

// Default pixel spacing for X-ray images (typical value ~0.14-0.2 mm/pixel)
const DEFAULT_PIXEL_SPACING: [number, number] = [0.15, 0.15];

export function AnnotationOverlay({
  pixelSpacing,
  className = '',
}: AnnotationOverlayProps) {
  // Use provided pixel spacing or default
  const effectivePixelSpacing = pixelSpacing || DEFAULT_PIXEL_SPACING;
  const {
    annotations,
    selectedAnnotationId,
    showAnnotations,
    setSelectedAnnotation,
    updateAnnotation,
    deleteAnnotation,
    viewerState,
    imageDimensions,
    canvasDimensions,
  } = useViewerStore();

  // Keyboard event listener for Delete key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationId) {
        e.preventDefault();
        deleteAnnotation(selectedAnnotationId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnnotationId, deleteAnnotation]);

  // Drag state
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [activeHandle, setActiveHandle] = useState<ResizeHandle | null>(null);
  const dragStartPos = useRef<Point | null>(null);
  const originalPoints = useRef<Point[] | null>(null);

  // Transform point from image coordinates to screen coordinates
  const transformPoint = (point: Point): Point => {
    const { zoom, pan, rotation, flip } = viewerState;

    if (!imageDimensions || !canvasDimensions) {
      return point;
    }

    const centerX = canvasDimensions.width / 2 + pan.x;
    const centerY = canvasDimensions.height / 2 + pan.y;

    let x = point.x - imageDimensions.width / 2;
    let y = point.y - imageDimensions.height / 2;

    const scaleX = flip.horizontal ? -zoom : zoom;
    const scaleY = flip.vertical ? -zoom : zoom;
    x = x * scaleX;
    y = y * scaleY;

    const radians = (rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const rotatedX = x * cos - y * sin;
    const rotatedY = x * sin + y * cos;

    return { x: rotatedX + centerX, y: rotatedY + centerY };
  };

  // Transform screen coordinates back to image coordinates
  const screenToImage = (screenX: number, screenY: number): Point => {
    const { zoom, pan, rotation, flip } = viewerState;

    if (!imageDimensions || !canvasDimensions) {
      return { x: screenX, y: screenY };
    }

    const centerX = canvasDimensions.width / 2 + pan.x;
    const centerY = canvasDimensions.height / 2 + pan.y;

    let x = screenX - centerX;
    let y = screenY - centerY;

    const radians = (-rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const rotatedX = x * cos - y * sin;
    const rotatedY = x * sin + y * cos;
    x = rotatedX;
    y = rotatedY;

    const scaleX = flip.horizontal ? -zoom : zoom;
    const scaleY = flip.vertical ? -zoom : zoom;
    x = x / scaleX;
    y = y / scaleY;

    return {
      x: x + imageDimensions.width / 2,
      y: y + imageDimensions.height / 2,
    };
  };

  // Get mouse position in SVG coordinates
  const getMousePosition = (e: React.MouseEvent<SVGSVGElement>): Point => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const scaleX = (canvasDimensions?.width || rect.width) / rect.width;
    const scaleY = (canvasDimensions?.height || rect.height) / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  // Handle mouse down on shape (for moving)
  const handleShapeMouseDown = (e: React.MouseEvent, annotationId: string) => {
    e.stopPropagation();
    const annotation = annotations.find(a => a.id === annotationId);
    if (!annotation) return;

    setSelectedAnnotation(annotationId);
    setDragMode('move');
    dragStartPos.current = getMousePosition(e as React.MouseEvent<SVGSVGElement>);
    originalPoints.current = [...annotation.points];
  };

  // Handle double-click to delete annotation
  const handleDoubleClick = (e: React.MouseEvent, annotationId: string) => {
    e.stopPropagation();
    e.preventDefault();
    deleteAnnotation(annotationId);
  };

  // Handle mouse down on resize handle
  const handleHandleMouseDown = (e: React.MouseEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    if (!selectedAnnotationId) return;

    const annotation = annotations.find(a => a.id === selectedAnnotationId);
    if (!annotation) return;

    setDragMode('resize');
    setActiveHandle(handle);
    dragStartPos.current = getMousePosition(e as React.MouseEvent<SVGSVGElement>);
    originalPoints.current = [...annotation.points];
  };

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (dragMode === 'none' || !dragStartPos.current || !originalPoints.current || !selectedAnnotationId) {
      return;
    }

    const currentPos = getMousePosition(e);
    const dx = currentPos.x - dragStartPos.current.x;
    const dy = currentPos.y - dragStartPos.current.y;

    const annotation = annotations.find(a => a.id === selectedAnnotationId);
    if (!annotation) return;

    if (dragMode === 'move') {
      // Move all points by delta (in image coordinates)
      const startImage = screenToImage(dragStartPos.current.x, dragStartPos.current.y);
      const currentImage = screenToImage(currentPos.x, currentPos.y);
      const imageDx = currentImage.x - startImage.x;
      const imageDy = currentImage.y - startImage.y;

      const newPoints = originalPoints.current.map(p => ({
        x: p.x + imageDx,
        y: p.y + imageDy,
      }));
      updateAnnotation(selectedAnnotationId, { points: newPoints });
    } else if (dragMode === 'resize' && activeHandle && annotation.points.length >= 2) {
      // Resize based on which handle is being dragged
      const [p0, p1] = originalPoints.current;
      const currentImage = screenToImage(currentPos.x, currentPos.y);

      let newP0 = { ...p0 };
      let newP1 = { ...p1 };

      // Determine min/max for proper rectangle orientation
      const minX = Math.min(p0.x, p1.x);
      const maxX = Math.max(p0.x, p1.x);
      const minY = Math.min(p0.y, p1.y);
      const maxY = Math.max(p0.y, p1.y);

      switch (activeHandle) {
        case 'nw':
          newP0 = { x: currentImage.x, y: currentImage.y };
          newP1 = { x: maxX, y: maxY };
          break;
        case 'ne':
          newP0 = { x: minX, y: currentImage.y };
          newP1 = { x: currentImage.x, y: maxY };
          break;
        case 'sw':
          newP0 = { x: currentImage.x, y: minY };
          newP1 = { x: maxX, y: currentImage.y };
          break;
        case 'se':
          newP0 = { x: minX, y: minY };
          newP1 = { x: currentImage.x, y: currentImage.y };
          break;
        case 'n':
          newP0 = { x: minX, y: currentImage.y };
          newP1 = { x: maxX, y: maxY };
          break;
        case 's':
          newP0 = { x: minX, y: minY };
          newP1 = { x: maxX, y: currentImage.y };
          break;
        case 'w':
          newP0 = { x: currentImage.x, y: minY };
          newP1 = { x: maxX, y: maxY };
          break;
        case 'e':
          newP0 = { x: minX, y: minY };
          newP1 = { x: currentImage.x, y: maxY };
          break;
      }

      updateAnnotation(selectedAnnotationId, { points: [newP0, newP1] });
    }
  }, [dragMode, activeHandle, selectedAnnotationId, annotations, updateAnnotation, screenToImage]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setDragMode('none');
    setActiveHandle(null);
    dragStartPos.current = null;
    originalPoints.current = null;
  }, []);

  // Get cursor style based on handle
  const getHandleCursor = (handle: ResizeHandle): string => {
    const cursors: Record<ResizeHandle, string> = {
      nw: 'nw-resize',
      n: 'n-resize',
      ne: 'ne-resize',
      e: 'e-resize',
      se: 'se-resize',
      s: 's-resize',
      sw: 'sw-resize',
      w: 'w-resize',
    };
    return cursors[handle];
  };

  // Render resize handles for rectangle/ellipse
  const renderResizeHandles = (annotation: Annotation, color: string) => {
    if (annotation.points.length < 2) return null;
    if (!['rectangle', 'ellipse'].includes(annotation.type)) return null;

    const start = transformPoint(annotation.points[0]);
    const end = transformPoint(annotation.points[1]);

    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    const cx = x + width / 2;
    const cy = y + height / 2;

    const handles: { handle: ResizeHandle; x: number; y: number }[] = [
      { handle: 'nw', x: x, y: y },
      { handle: 'n', x: cx, y: y },
      { handle: 'ne', x: x + width, y: y },
      { handle: 'e', x: x + width, y: cy },
      { handle: 'se', x: x + width, y: y + height },
      { handle: 's', x: cx, y: y + height },
      { handle: 'sw', x: x, y: y + height },
      { handle: 'w', x: x, y: cy },
    ];

    return (
      <>
        {handles.map(({ handle, x, y }) => (
          <circle
            key={handle}
            cx={x}
            cy={y}
            r={6}
            fill="white"
            stroke={color}
            strokeWidth={2}
            style={{ cursor: getHandleCursor(handle) }}
            onMouseDown={(e) => handleHandleMouseDown(e, handle)}
          />
        ))}
      </>
    );
  };

  const renderAnnotation = (annotation: Annotation) => {
    const isSelected = annotation.id === selectedAnnotationId;
    const strokeWidth = annotation.strokeWidth * (isSelected ? 1.5 : 1);
    const color = annotation.color;

    switch (annotation.type) {
      case 'freehand':
        return renderFreehand(annotation, color, strokeWidth, isSelected);
      case 'arrow':
        return renderArrow(annotation, color, strokeWidth, isSelected);
      case 'ellipse':
        return renderEllipse(annotation, color, strokeWidth, isSelected);
      case 'rectangle':
        return renderRectangle(annotation, color, strokeWidth, isSelected);
      case 'text':
        return renderText(annotation, color, isSelected);
      case 'marker':
        return renderMarker(annotation, color, isSelected);
      default:
        return null;
    }
  };

  const renderFreehand = (
    annotation: Annotation,
    color: string,
    strokeWidth: number,
    isSelected: boolean
  ) => {
    if (annotation.points.length < 2) return null;

    const pathData = annotation.points
      .map((p, i) => {
        const transformed = transformPoint(p);
        return `${i === 0 ? 'M' : 'L'} ${transformed.x} ${transformed.y}`;
      })
      .join(' ');

    return (
      <g key={annotation.id}>
        <path
          d={pathData}
          fill="none"
          stroke="transparent"
          strokeWidth={strokeWidth + 10}
          style={{ cursor: 'move' }}
          onMouseDown={(e) => handleShapeMouseDown(e, annotation.id)}
          onDoubleClick={(e) => handleDoubleClick(e, annotation.id)}
        />
        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isSelected ? 'filter drop-shadow-lg' : ''}
          pointerEvents="none"
        />
        {isSelected && (
          <>
            <circle
              cx={transformPoint(annotation.points[0]).x}
              cy={transformPoint(annotation.points[0]).y}
              r={5}
              fill={color}
              stroke="white"
              strokeWidth={1}
            />
            <circle
              cx={transformPoint(annotation.points[annotation.points.length - 1]).x}
              cy={transformPoint(annotation.points[annotation.points.length - 1]).y}
              r={5}
              fill={color}
              stroke="white"
              strokeWidth={1}
            />
          </>
        )}
      </g>
    );
  };

  const renderArrow = (
    annotation: Annotation,
    color: string,
    strokeWidth: number,
    isSelected: boolean
  ) => {
    if (annotation.points.length < 2) return null;

    const start = transformPoint(annotation.points[0]);
    const end = transformPoint(annotation.points[annotation.points.length - 1]);

    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const arrowLength = 15;
    const arrowAngle = Math.PI / 6;

    const arrowPoint1 = {
      x: end.x - arrowLength * Math.cos(angle - arrowAngle),
      y: end.y - arrowLength * Math.sin(angle - arrowAngle),
    };
    const arrowPoint2 = {
      x: end.x - arrowLength * Math.cos(angle + arrowAngle),
      y: end.y - arrowLength * Math.sin(angle + arrowAngle),
    };

    return (
      <g key={annotation.id}>
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke="transparent"
          strokeWidth={strokeWidth + 10}
          style={{ cursor: 'move' }}
          onMouseDown={(e) => handleShapeMouseDown(e, annotation.id)}
          onDoubleClick={(e) => handleDoubleClick(e, annotation.id)}
        />
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={color}
          strokeWidth={strokeWidth}
          className={isSelected ? 'filter drop-shadow-lg' : ''}
          pointerEvents="none"
        />
        <polygon
          points={`${end.x},${end.y} ${arrowPoint1.x},${arrowPoint1.y} ${arrowPoint2.x},${arrowPoint2.y}`}
          fill={color}
          pointerEvents="none"
        />
        {isSelected && (
          <>
            <circle cx={start.x} cy={start.y} r={5} fill={color} stroke="white" strokeWidth={1} />
            <circle cx={end.x} cy={end.y} r={5} fill={color} stroke="white" strokeWidth={1} />
          </>
        )}
      </g>
    );
  };

  const renderEllipse = (
    annotation: Annotation,
    color: string,
    strokeWidth: number,
    isSelected: boolean
  ) => {
    if (annotation.points.length < 2) return null;

    const start = transformPoint(annotation.points[0]);
    const end = transformPoint(annotation.points[1]);

    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;

    // Calculate area in real units (mm² then convert to cm²)
    const imageRxMm = Math.abs(annotation.points[1].x - annotation.points[0].x) / 2 * effectivePixelSpacing[1];
    const imageRyMm = Math.abs(annotation.points[1].y - annotation.points[0].y) / 2 * effectivePixelSpacing[0];
    const areaMm2 = Math.PI * imageRxMm * imageRyMm;
    const areaCm2 = areaMm2 / 100; // 1 cm² = 100 mm²

    // Format area display
    const areaDisplay = areaCm2 >= 1
      ? `${areaCm2.toFixed(1)} cm²`
      : `${areaMm2.toFixed(0)} mm²`;

    return (
      <g key={annotation.id}>
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="transparent"
          stroke="transparent"
          strokeWidth={strokeWidth + 10}
          style={{ cursor: 'move' }}
          onMouseDown={(e) => handleShapeMouseDown(e, annotation.id)}
          onDoubleClick={(e) => handleDoubleClick(e, annotation.id)}
        />
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          className={isSelected ? 'filter drop-shadow-lg' : ''}
          pointerEvents="none"
        />
        {/* Area label */}
        <rect
          x={cx - 40}
          y={cy - 8}
          width={80}
          height={16}
          fill="rgba(0,0,0,0.7)"
          rx={3}
          pointerEvents="none"
        />
        <text
          x={cx}
          y={cy + 4}
          fill={color}
          fontSize={12}
          textAnchor="middle"
          fontFamily="monospace"
          pointerEvents="none"
        >
          {areaDisplay}
        </text>
        {isSelected && renderResizeHandles(annotation, color)}
      </g>
    );
  };

  const renderRectangle = (
    annotation: Annotation,
    color: string,
    strokeWidth: number,
    isSelected: boolean
  ) => {
    if (annotation.points.length < 2) return null;

    const start = transformPoint(annotation.points[0]);
    const end = transformPoint(annotation.points[1]);

    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    const cx = x + width / 2;
    const cy = y + height / 2;

    // Calculate area in real units (mm² then convert to cm²)
    const imageWidthMm = Math.abs(annotation.points[1].x - annotation.points[0].x) * effectivePixelSpacing[1];
    const imageHeightMm = Math.abs(annotation.points[1].y - annotation.points[0].y) * effectivePixelSpacing[0];
    const areaMm2 = imageWidthMm * imageHeightMm;
    const areaCm2 = areaMm2 / 100; // 1 cm² = 100 mm²

    // Format area display
    const areaDisplay = areaCm2 >= 1
      ? `${areaCm2.toFixed(1)} cm²`
      : `${areaMm2.toFixed(0)} mm²`;

    return (
      <g key={annotation.id}>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="transparent"
          stroke="transparent"
          strokeWidth={strokeWidth + 10}
          style={{ cursor: 'move' }}
          onMouseDown={(e) => handleShapeMouseDown(e, annotation.id)}
          onDoubleClick={(e) => handleDoubleClick(e, annotation.id)}
        />
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          className={isSelected ? 'filter drop-shadow-lg' : ''}
          pointerEvents="none"
        />
        {/* Area label */}
        <rect
          x={cx - 40}
          y={cy - 8}
          width={80}
          height={16}
          fill="rgba(0,0,0,0.7)"
          rx={3}
          pointerEvents="none"
        />
        <text
          x={cx}
          y={cy + 4}
          fill={color}
          fontSize={12}
          textAnchor="middle"
          fontFamily="monospace"
          pointerEvents="none"
        >
          {areaDisplay}
        </text>
        {isSelected && renderResizeHandles(annotation, color)}
      </g>
    );
  };

  const renderText = (
    annotation: Annotation,
    color: string,
    isSelected: boolean
  ) => {
    if (annotation.points.length < 1 || !annotation.text) return null;

    const pos = transformPoint(annotation.points[0]);

    return (
      <g key={annotation.id}>
        <rect
          x={pos.x - 2}
          y={pos.y - 14}
          width={annotation.text.length * 8 + 4}
          height={18}
          fill="rgba(0,0,0,0.7)"
          rx={3}
          style={{ cursor: 'move' }}
          onMouseDown={(e) => handleShapeMouseDown(e, annotation.id)}
          onDoubleClick={(e) => handleDoubleClick(e, annotation.id)}
        />
        <text
          x={pos.x}
          y={pos.y}
          fill={color}
          fontSize={14}
          fontFamily="sans-serif"
          className={isSelected ? 'filter drop-shadow-lg' : ''}
          pointerEvents="none"
        >
          {annotation.text}
        </text>
        {isSelected && (
          <rect
            x={pos.x - 4}
            y={pos.y - 16}
            width={annotation.text.length * 8 + 8}
            height={22}
            fill="none"
            stroke={color}
            strokeWidth={1}
            strokeDasharray="4,2"
            pointerEvents="none"
          />
        )}
      </g>
    );
  };

  const renderMarker = (
    annotation: Annotation,
    color: string,
    isSelected: boolean
  ) => {
    if (annotation.points.length < 1) return null;

    const pos = transformPoint(annotation.points[0]);
    const size = 12;

    return (
      <g key={annotation.id}>
        <circle
          cx={pos.x}
          cy={pos.y}
          r={size}
          fill={color}
          fillOpacity={0.3}
          stroke={color}
          strokeWidth={2}
          style={{ cursor: 'move' }}
          className={isSelected ? 'filter drop-shadow-lg' : ''}
          onMouseDown={(e) => handleShapeMouseDown(e, annotation.id)}
          onDoubleClick={(e) => handleDoubleClick(e, annotation.id)}
        />
        <line
          x1={pos.x - size / 2}
          y1={pos.y}
          x2={pos.x + size / 2}
          y2={pos.y}
          stroke={color}
          strokeWidth={2}
          pointerEvents="none"
        />
        <line
          x1={pos.x}
          y1={pos.y - size / 2}
          x2={pos.x}
          y2={pos.y + size / 2}
          stroke={color}
          strokeWidth={2}
          pointerEvents="none"
        />
        {annotation.text && (
          <text
            x={pos.x + size + 4}
            y={pos.y + 4}
            fill={color}
            fontSize={12}
            pointerEvents="none"
          >
            {annotation.text}
          </text>
        )}
      </g>
    );
  };

  // Early return after all hooks
  if (!showAnnotations || annotations.length === 0) {
    return null;
  }

  return (
    <svg
      className={`annotation-layer ${className}`}
      width={canvasDimensions?.width || '100%'}
      height={canvasDimensions?.height || '100%'}
      viewBox={canvasDimensions ? `0 0 ${canvasDimensions.width} ${canvasDimensions.height}` : undefined}
      preserveAspectRatio="none"
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 10,
        pointerEvents: dragMode !== 'none' ? 'auto' : 'none',
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <g style={{ pointerEvents: 'auto' }}>
        {annotations.map(renderAnnotation)}
      </g>
    </svg>
  );
}
