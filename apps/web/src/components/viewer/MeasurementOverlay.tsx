'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useViewerStore } from '@/stores';
import type { Measurement, Point } from '@/types';

interface MeasurementOverlayProps {
  pixelSpacing?: [number, number]; // mm per pixel [row, column]
  className?: string;
}

type DragMode = 'none' | 'move' | 'resize';
type DragHandle = 'start' | 'end' | 'middle' | 'p1' | 'p2' | 'p3' | 'vertex';

// Default pixel spacing for X-ray images (typical value ~0.14-0.2 mm/pixel)
const DEFAULT_PIXEL_SPACING: [number, number] = [0.15, 0.15];

export function MeasurementOverlay({
  pixelSpacing,
  className = '',
}: MeasurementOverlayProps) {
  // Use provided pixel spacing or default
  const effectivePixelSpacing = pixelSpacing || DEFAULT_PIXEL_SPACING;
  const {
    measurements,
    selectedMeasurementId,
    showMeasurements,
    setSelectedMeasurement,
    updateMeasurement,
    deleteMeasurement,
    viewerState,
    imageDimensions,
    canvasDimensions,
  } = useViewerStore();

  // Keyboard event listener for Delete key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMeasurementId) {
        e.preventDefault();
        deleteMeasurement(selectedMeasurementId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMeasurementId, deleteMeasurement]);

  // Drag state
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [activeHandle, setActiveHandle] = useState<DragHandle | null>(null);
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
  const handleShapeMouseDown = (e: React.MouseEvent, measurementId: string) => {
    e.stopPropagation();
    const measurement = measurements.find(m => m.id === measurementId);
    if (!measurement) return;

    setSelectedMeasurement(measurementId);
    setDragMode('move');
    dragStartPos.current = getMousePosition(e as React.MouseEvent<SVGSVGElement>);
    originalPoints.current = [...measurement.points];
  };

  // Handle double-click to delete measurement
  const handleDoubleClick = (e: React.MouseEvent, measurementId: string) => {
    e.stopPropagation();
    e.preventDefault();
    deleteMeasurement(measurementId);
  };

  // Handle mouse down on resize handle
  const handleHandleMouseDown = (e: React.MouseEvent, handle: DragHandle) => {
    e.stopPropagation();
    if (!selectedMeasurementId) return;

    const measurement = measurements.find(m => m.id === selectedMeasurementId);
    if (!measurement) return;

    setDragMode('resize');
    setActiveHandle(handle);
    dragStartPos.current = getMousePosition(e as React.MouseEvent<SVGSVGElement>);
    originalPoints.current = [...measurement.points];
  };

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (dragMode === 'none' || !dragStartPos.current || !originalPoints.current || !selectedMeasurementId) {
      return;
    }

    const currentPos = getMousePosition(e);
    const measurement = measurements.find(m => m.id === selectedMeasurementId);
    if (!measurement) return;

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

      // Recalculate value based on new points
      const newValue = calculateMeasurementValue(measurement.type, newPoints);
      updateMeasurement(selectedMeasurementId, { points: newPoints, value: newValue });
    } else if (dragMode === 'resize' && activeHandle) {
      const currentImage = screenToImage(currentPos.x, currentPos.y);
      let newPoints = [...originalPoints.current];

      // Update the specific handle point
      switch (activeHandle) {
        case 'start':
          newPoints[0] = currentImage;
          break;
        case 'end':
          newPoints[newPoints.length - 1] = currentImage;
          break;
        case 'vertex':
        case 'middle':
          if (newPoints.length >= 2) {
            newPoints[1] = currentImage;
          }
          break;
        case 'p1':
          newPoints[0] = currentImage;
          break;
        case 'p2':
          if (newPoints.length >= 2) newPoints[1] = currentImage;
          break;
        case 'p3':
          if (newPoints.length >= 3) newPoints[2] = currentImage;
          break;
      }

      // Recalculate value based on new points
      const newValue = calculateMeasurementValue(measurement.type, newPoints);
      updateMeasurement(selectedMeasurementId, { points: newPoints, value: newValue });
    }
  }, [dragMode, activeHandle, selectedMeasurementId, measurements, updateMeasurement, screenToImage]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setDragMode('none');
    setActiveHandle(null);
    dragStartPos.current = null;
    originalPoints.current = null;
  }, []);

  // Calculate measurement value based on type and points
  const calculateMeasurementValue = (type: string, points: Point[]): number => {
    if (points.length < 2) return 0;

    switch (type) {
      case 'distance': {
        const p1 = points[0];
        const p2 = points[points.length - 1];
        const dx = (p2.x - p1.x) * effectivePixelSpacing[1];
        const dy = (p2.y - p1.y) * effectivePixelSpacing[0];
        return Math.sqrt(dx * dx + dy * dy);
      }
      case 'angle': {
        if (points.length < 3) return 0;
        // Calculate interior angle (0-180°) using dot product formula
        const v1 = { x: points[0].x - points[1].x, y: points[0].y - points[1].y };
        const v2 = { x: points[2].x - points[1].x, y: points[2].y - points[1].y };
        const dot = v1.x * v2.x + v1.y * v2.y;
        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
        if (mag1 === 0 || mag2 === 0) return 0;
        const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
        return Math.acos(cosAngle) * (180 / Math.PI);
      }
      case 'area': {
        if (points.length < 2) return 0;
        const width = Math.abs(points[1].x - points[0].x) * effectivePixelSpacing[1];
        const height = Math.abs(points[1].y - points[0].y) * effectivePixelSpacing[0];
        return width * height;
      }
      case 'cobb_angle': {
        if (points.length < 4) return 0;
        const angle1 = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
        const angle2 = Math.atan2(points[3].y - points[2].y, points[3].x - points[2].x);
        let cobbAngle = Math.abs(angle1 - angle2) * (180 / Math.PI);
        if (cobbAngle > 90) cobbAngle = 180 - cobbAngle;
        return cobbAngle;
      }
      default:
        return 0;
    }
  };

  // Calculate distance between two points in mm
  const calculateDistance = (p1: Point, p2: Point): number => {
    const dx = (p2.x - p1.x) * effectivePixelSpacing[1];
    const dy = (p2.y - p1.y) * effectivePixelSpacing[0];
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Calculate interior angle between three points (0-180°)
  const calculateAngle = (p1: Point, p2: Point, p3: Point): number => {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

    if (mag1 === 0 || mag2 === 0) return 0;
    const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return Math.acos(cosAngle) * (180 / Math.PI);
  };

  const renderMeasurement = (measurement: Measurement) => {
    const isSelected = measurement.id === selectedMeasurementId;
    const color = measurement.color || '#00ff00';

    switch (measurement.type) {
      case 'distance':
        return renderDistance(measurement, color, isSelected);
      case 'angle':
        return renderAngle(measurement, color, isSelected);
      case 'area':
        return renderArea(measurement, color, isSelected);
      case 'cobb_angle':
        return renderCobbAngle(measurement, color, isSelected);
      default:
        return null;
    }
  };

  // Render a draggable handle
  const renderHandle = (x: number, y: number, handle: DragHandle, color: string) => (
    <circle
      cx={x}
      cy={y}
      r={6}
      fill="white"
      stroke={color}
      strokeWidth={2}
      style={{ cursor: 'pointer' }}
      onMouseDown={(e) => handleHandleMouseDown(e, handle)}
    />
  );

  const renderDistance = (
    measurement: Measurement,
    color: string,
    isSelected: boolean
  ) => {
    if (measurement.points.length < 2) return null;

    const start = transformPoint(measurement.points[0]);
    const end = transformPoint(measurement.points[1]);
    const distanceMm = calculateDistance(measurement.points[0], measurement.points[1]);

    // Format distance display (cm for >= 10mm, mm for smaller)
    const distanceDisplay = distanceMm >= 10
      ? `${(distanceMm / 10).toFixed(1)} cm`
      : `${distanceMm.toFixed(1)} mm`;
    const labelWidth = distanceMm >= 10 ? 55 : 50;

    const mid = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    };

    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const perpAngle = angle + Math.PI / 2;
    const tickLength = 8;

    const startTick1 = {
      x: start.x + tickLength * Math.cos(perpAngle),
      y: start.y + tickLength * Math.sin(perpAngle),
    };
    const startTick2 = {
      x: start.x - tickLength * Math.cos(perpAngle),
      y: start.y - tickLength * Math.sin(perpAngle),
    };
    const endTick1 = {
      x: end.x + tickLength * Math.cos(perpAngle),
      y: end.y + tickLength * Math.sin(perpAngle),
    };
    const endTick2 = {
      x: end.x - tickLength * Math.cos(perpAngle),
      y: end.y - tickLength * Math.sin(perpAngle),
    };

    return (
      <g key={measurement.id}>
        {/* Hit area */}
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke="transparent"
          strokeWidth={12}
          style={{ cursor: 'move' }}
          onMouseDown={(e) => handleShapeMouseDown(e, measurement.id)}
          onDoubleClick={(e) => handleDoubleClick(e, measurement.id)}
        />
        {/* Main line */}
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={color}
          strokeWidth={2}
          strokeDasharray="5,3"
          className={isSelected ? 'filter drop-shadow-lg' : ''}
          pointerEvents="none"
        />
        {/* Ticks */}
        <line x1={startTick1.x} y1={startTick1.y} x2={startTick2.x} y2={startTick2.y} stroke={color} strokeWidth={2} pointerEvents="none" />
        <line x1={endTick1.x} y1={endTick1.y} x2={endTick2.x} y2={endTick2.y} stroke={color} strokeWidth={2} pointerEvents="none" />
        {/* Label */}
        <rect x={mid.x - labelWidth/2} y={mid.y - 20} width={labelWidth} height={16} fill="rgba(0,0,0,0.8)" rx={3} pointerEvents="none" />
        <text x={mid.x} y={mid.y - 8} fill={color} fontSize={12} textAnchor="middle" fontFamily="monospace" pointerEvents="none">
          {distanceDisplay}
        </text>
        {/* Handles */}
        {isSelected && (
          <>
            {renderHandle(start.x, start.y, 'start', color)}
            {renderHandle(end.x, end.y, 'end', color)}
          </>
        )}
      </g>
    );
  };

  const renderAngle = (
    measurement: Measurement,
    color: string,
    isSelected: boolean
  ) => {
    if (measurement.points.length < 3) return null;

    const p1 = transformPoint(measurement.points[0]);
    const vertex = transformPoint(measurement.points[1]);
    const p2 = transformPoint(measurement.points[2]);

    const angle = calculateAngle(
      measurement.points[0],
      measurement.points[1],
      measurement.points[2]
    );

    const radius = 30;
    const startAngle = Math.atan2(p1.y - vertex.y, p1.x - vertex.x);
    const endAngle = Math.atan2(p2.y - vertex.y, p2.x - vertex.x);
    const arcPath = describeArc(vertex.x, vertex.y, radius, startAngle, endAngle);

    return (
      <g key={measurement.id}>
        {/* Hit areas */}
        <line x1={p1.x} y1={p1.y} x2={vertex.x} y2={vertex.y} stroke="transparent" strokeWidth={10} style={{ cursor: 'move' }} onMouseDown={(e) => handleShapeMouseDown(e, measurement.id)} onDoubleClick={(e) => handleDoubleClick(e, measurement.id)} />
        <line x1={vertex.x} y1={vertex.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={10} style={{ cursor: 'move' }} onMouseDown={(e) => handleShapeMouseDown(e, measurement.id)} onDoubleClick={(e) => handleDoubleClick(e, measurement.id)} />
        {/* Lines */}
        <line x1={p1.x} y1={p1.y} x2={vertex.x} y2={vertex.y} stroke={color} strokeWidth={2} className={isSelected ? 'filter drop-shadow-lg' : ''} pointerEvents="none" />
        <line x1={vertex.x} y1={vertex.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth={2} className={isSelected ? 'filter drop-shadow-lg' : ''} pointerEvents="none" />
        {/* Arc */}
        <path d={arcPath} fill="none" stroke={color} strokeWidth={1} pointerEvents="none" />
        {/* Label */}
        <rect x={vertex.x + 20} y={vertex.y - 20} width={45} height={16} fill="rgba(0,0,0,0.8)" rx={3} pointerEvents="none" />
        <text x={vertex.x + 42} y={vertex.y - 8} fill={color} fontSize={12} textAnchor="middle" fontFamily="monospace" pointerEvents="none">
          {angle.toFixed(1)}°
        </text>
        {/* Handles */}
        {isSelected && (
          <>
            {renderHandle(p1.x, p1.y, 'p1', color)}
            {renderHandle(vertex.x, vertex.y, 'vertex', color)}
            {renderHandle(p2.x, p2.y, 'p3', color)}
          </>
        )}
      </g>
    );
  };

  const renderArea = (
    measurement: Measurement,
    color: string,
    isSelected: boolean
  ) => {
    if (measurement.points.length < 2) return null;

    const start = transformPoint(measurement.points[0]);
    const end = transformPoint(measurement.points[1]);

    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    const areaWidthMm = Math.abs(measurement.points[1].x - measurement.points[0].x) * effectivePixelSpacing[1];
    const areaHeightMm = Math.abs(measurement.points[1].y - measurement.points[0].y) * effectivePixelSpacing[0];
    const areaMm2 = areaWidthMm * areaHeightMm;
    const areaCm2 = areaMm2 / 100; // 1 cm² = 100 mm²

    // Format area display
    const areaDisplay = areaCm2 >= 1
      ? `${areaCm2.toFixed(1)} cm²`
      : `${areaMm2.toFixed(0)} mm²`;

    const centroid = { x: x + width / 2, y: y + height / 2 };

    return (
      <g key={measurement.id}>
        {/* Filled area - also serves as hit area */}
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={color}
          fillOpacity={0.2}
          stroke={color}
          strokeWidth={2}
          style={{ cursor: 'move' }}
          className={isSelected ? 'filter drop-shadow-lg' : ''}
          onMouseDown={(e) => handleShapeMouseDown(e, measurement.id)}
          onDoubleClick={(e) => handleDoubleClick(e, measurement.id)}
        />
        {/* Label */}
        <rect x={centroid.x - 40} y={centroid.y - 10} width={80} height={16} fill="rgba(0,0,0,0.8)" rx={3} pointerEvents="none" />
        <text x={centroid.x} y={centroid.y + 2} fill={color} fontSize={12} textAnchor="middle" fontFamily="monospace" pointerEvents="none">
          {areaDisplay}
        </text>
        {/* Handles */}
        {isSelected && (
          <>
            {renderHandle(x, y, 'start', color)}
            {renderHandle(x + width, y + height, 'end', color)}
            {renderHandle(x + width, y, 'p2', color)}
            {renderHandle(x, y + height, 'p3', color)}
          </>
        )}
      </g>
    );
  };

  const renderCobbAngle = (
    measurement: Measurement,
    color: string,
    isSelected: boolean
  ) => {
    if (measurement.points.length < 4) return null;

    const l1p1 = transformPoint(measurement.points[0]);
    const l1p2 = transformPoint(measurement.points[1]);
    const l2p1 = transformPoint(measurement.points[2]);
    const l2p2 = transformPoint(measurement.points[3]);

    const angle1 = Math.atan2(l1p2.y - l1p1.y, l1p2.x - l1p1.x);
    const angle2 = Math.atan2(l2p2.y - l2p1.y, l2p2.x - l2p1.x);
    let cobbAngle = Math.abs(angle1 - angle2) * (180 / Math.PI);
    if (cobbAngle > 90) cobbAngle = 180 - cobbAngle;

    const mid = {
      x: (l1p1.x + l1p2.x + l2p1.x + l2p2.x) / 4,
      y: (l1p1.y + l1p2.y + l2p1.y + l2p2.y) / 4,
    };

    return (
      <g key={measurement.id}>
        {/* Hit areas */}
        <line x1={l1p1.x} y1={l1p1.y} x2={l1p2.x} y2={l1p2.y} stroke="transparent" strokeWidth={10} style={{ cursor: 'move' }} onMouseDown={(e) => handleShapeMouseDown(e, measurement.id)} onDoubleClick={(e) => handleDoubleClick(e, measurement.id)} />
        <line x1={l2p1.x} y1={l2p1.y} x2={l2p2.x} y2={l2p2.y} stroke="transparent" strokeWidth={10} style={{ cursor: 'move' }} onMouseDown={(e) => handleShapeMouseDown(e, measurement.id)} onDoubleClick={(e) => handleDoubleClick(e, measurement.id)} />
        {/* Lines */}
        <line x1={l1p1.x} y1={l1p1.y} x2={l1p2.x} y2={l1p2.y} stroke={color} strokeWidth={2} className={isSelected ? 'filter drop-shadow-lg' : ''} pointerEvents="none" />
        <line x1={l2p1.x} y1={l2p1.y} x2={l2p2.x} y2={l2p2.y} stroke={color} strokeWidth={2} className={isSelected ? 'filter drop-shadow-lg' : ''} pointerEvents="none" />
        {/* Extended lines */}
        <line x1={l1p1.x} y1={l1p1.y} x2={l1p1.x + (l1p2.x - l1p1.x) * 2} y2={l1p1.y + (l1p2.y - l1p1.y) * 2} stroke={color} strokeWidth={1} strokeDasharray="3,3" opacity={0.5} pointerEvents="none" />
        <line x1={l2p1.x} y1={l2p1.y} x2={l2p1.x + (l2p2.x - l2p1.x) * 2} y2={l2p1.y + (l2p2.y - l2p1.y) * 2} stroke={color} strokeWidth={1} strokeDasharray="3,3" opacity={0.5} pointerEvents="none" />
        {/* Label */}
        <rect x={mid.x - 40} y={mid.y - 10} width={80} height={20} fill="rgba(0,0,0,0.8)" rx={3} pointerEvents="none" />
        <text x={mid.x} y={mid.y + 5} fill={color} fontSize={12} textAnchor="middle" fontFamily="monospace" pointerEvents="none">
          Cobb: {cobbAngle.toFixed(1)}°
        </text>
        {/* Handles */}
        {isSelected && (
          <>
            {renderHandle(l1p1.x, l1p1.y, 'start', color)}
            {renderHandle(l1p2.x, l1p2.y, 'p2', color)}
            {renderHandle(l2p1.x, l2p1.y, 'p3', color)}
            {renderHandle(l2p2.x, l2p2.y, 'end', color)}
          </>
        )}
      </g>
    );
  };

  // Helper function to describe an SVG arc
  const describeArc = (
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number
  ): string => {
    const start = {
      x: x + radius * Math.cos(startAngle),
      y: y + radius * Math.sin(startAngle),
    };
    const end = {
      x: x + radius * Math.cos(endAngle),
      y: y + radius * Math.sin(endAngle),
    };
    const largeArcFlag = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
    const sweepFlag = endAngle > startAngle ? 1 : 0;

    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
  };

  // Early return after all hooks
  if (!showMeasurements || measurements.length === 0) {
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
        zIndex: 11,
        pointerEvents: dragMode !== 'none' ? 'auto' : 'none',
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <g style={{ pointerEvents: 'auto' }}>
        {measurements.map(renderMeasurement)}
      </g>
    </svg>
  );
}
