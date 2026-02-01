'use client';

import { useViewerStore, useChatStore } from '@/stores';
import type { Detection, Point } from '@/types';

interface DetectionOverlayProps {
  className?: string;
}

// VinDR-CXR class names
const CLASS_NAMES: Record<number, string> = {
  0: 'Aortic enlargement',
  1: 'Atelectasis',
  2: 'Calcification',
  3: 'Cardiomegaly',
  4: 'Clavicle fracture',
  5: 'Consolidation',
  6: 'Edema',
  7: 'Emphysema',
  8: 'Enlarged PA',
  9: 'ILD',
  10: 'Infiltration',
  11: 'Lung Opacity',
  12: 'Lung cavity',
  13: 'Lung cyst',
  14: 'Mediastinal shift',
  15: 'Nodule/Mass',
  16: 'Pleural effusion',
  17: 'Pleural thickening',
  18: 'Pneumothorax',
  19: 'Pulmonary fibrosis',
  20: 'Rib fracture',
  21: 'Other lesion',
};

// Colors for different severity/classes
const getClassColor = (classId: number): string => {
  // Critical findings - Red
  if ([4, 14, 18, 20].includes(classId)) {
    return '#ef4444';
  }
  // Important findings - Orange
  if ([3, 5, 6, 15, 16].includes(classId)) {
    return '#f97316';
  }
  // Moderate findings - Yellow
  if ([0, 1, 2, 7, 8, 10, 11].includes(classId)) {
    return '#eab308';
  }
  // Other findings - Cyan
  return '#06b6d4';
};

export function DetectionOverlay({ className = '' }: DetectionOverlayProps) {
  const { showDetections, viewerState, imageDimensions, canvasDimensions } = useViewerStore();
  const { currentAnalysis } = useChatStore();

  if (!showDetections || !currentAnalysis || currentAnalysis.detections.length === 0) {
    return null;
  }

  // Need dimensions to properly scale
  if (!imageDimensions || !canvasDimensions) {
    return null;
  }

  const { detections } = currentAnalysis;
  const { zoom, pan, flip, rotation } = viewerState;

  // The viewerState.zoom already includes fit-to-screen scale
  // Canvas renders: translate(center + pan) -> rotate -> scale(zoom) -> drawImage(-img/2, -img/2)
  
  // Transform point from image coordinates to screen coordinates
  // This mirrors what DicomViewer does in its canvas rendering
  const transformPoint = (imgX: number, imgY: number): Point => {
    // Step 1: Center image at origin (same as canvas: -imageData.width/2, -imageData.height/2)
    let x = imgX - imageDimensions.width / 2;
    let y = imgY - imageDimensions.height / 2;
    
    // Step 2: Apply flip
    if (flip.horizontal) x = -x;
    if (flip.vertical) y = -y;
    
    // Step 3: Apply rotation (if any)
    if (rotation !== 0) {
      const rad = (rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const newX = x * cos - y * sin;
      const newY = x * sin + y * cos;
      x = newX;
      y = newY;
    }
    
    // Step 4: Apply zoom
    x *= zoom;
    y *= zoom;
    
    // Step 5: Translate to canvas center + pan
    x += canvasDimensions.width / 2 + pan.x;
    y += canvasDimensions.height / 2 + pan.y;
    
    return { x, y };
  };

  const renderDetection = (detection: Detection, index: number) => {
    const { bbox, confidence, classId, className: detectionClassName } = detection;
    const color = getClassColor(classId);
    
    // Transform bounding box corners
    const topLeft = transformPoint(bbox.x1, bbox.y1);
    const bottomRight = transformPoint(bbox.x2, bbox.y2);
    
    const width = bottomRight.x - topLeft.x;
    const height = bottomRight.y - topLeft.y;

    const label = detectionClassName || CLASS_NAMES[classId] || `Class ${classId}`;
    const confidencePercent = (confidence * 100).toFixed(0);

    return (
      <g key={`${detection.id}-${index}`}>
        {/* Bounding box */}
        <rect
          x={topLeft.x}
          y={topLeft.y}
          width={width}
          height={height}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeDasharray="5,3"
          className="pointer-events-none"
        />
        
        {/* Semi-transparent fill */}
        <rect
          x={topLeft.x}
          y={topLeft.y}
          width={width}
          height={height}
          fill={color}
          fillOpacity={0.1}
          className="pointer-events-none"
        />

        {/* Corner markers */}
        <CornerMarkers
          x={topLeft.x}
          y={topLeft.y}
          width={width}
          height={height}
          color={color}
        />

        {/* Label background */}
        <rect
          x={topLeft.x}
          y={topLeft.y - 22}
          width={Math.max(label.length * 7 + 45, 80)}
          height={20}
          fill="rgba(0,0,0,0.85)"
          rx={3}
        />
        
        {/* Label text */}
        <text
          x={topLeft.x + 4}
          y={topLeft.y - 8}
          fill={color}
          fontSize={11}
          fontFamily="sans-serif"
          fontWeight="500"
        >
          {label}
        </text>
        
        {/* Confidence badge */}
        <rect
          x={topLeft.x + label.length * 7 + 8}
          y={topLeft.y - 20}
          width={32}
          height={16}
          fill={color}
          rx={2}
        />
        <text
          x={topLeft.x + label.length * 7 + 24}
          y={topLeft.y - 9}
          fill="white"
          fontSize={10}
          textAnchor="middle"
          fontFamily="monospace"
          fontWeight="bold"
        >
          {confidencePercent}%
        </text>
      </g>
    );
  };

  return (
    <svg 
      className={`annotation-layer ${className}`}
      width={canvasDimensions.width}
      height={canvasDimensions.height}
      style={{ width: canvasDimensions.width, height: canvasDimensions.height }}
    >
      <defs>
        {/* Glow filter for emphasis */}
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      
      {detections.map(renderDetection)}
      
      {/* Detection count badge */}
      <g transform="translate(10, 10)">
        <rect
          width={120}
          height={24}
          fill="rgba(0,0,0,0.8)"
          rx={4}
        />
        <text
          x={10}
          y={16}
          fill="#22c55e"
          fontSize={12}
          fontFamily="sans-serif"
        >
          🔍 {detections.length} detection{detections.length > 1 ? 's' : ''}
        </text>
      </g>
    </svg>
  );
}

// Corner markers component for bounding box
function CornerMarkers({
  x,
  y,
  width,
  height,
  color,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}) {
  const cornerLength = 10;
  const strokeWidth = 3;

  return (
    <g stroke={color} strokeWidth={strokeWidth} fill="none">
      {/* Top-left */}
      <path d={`M ${x} ${y + cornerLength} L ${x} ${y} L ${x + cornerLength} ${y}`} />
      {/* Top-right */}
      <path d={`M ${x + width - cornerLength} ${y} L ${x + width} ${y} L ${x + width} ${y + cornerLength}`} />
      {/* Bottom-left */}
      <path d={`M ${x} ${y + height - cornerLength} L ${x} ${y + height} L ${x + cornerLength} ${y + height}`} />
      {/* Bottom-right */}
      <path d={`M ${x + width - cornerLength} ${y + height} L ${x + width} ${y + height} L ${x + width} ${y + height - cornerLength}`} />
    </g>
  );
}
