'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useViewerStore } from '@/stores';
import { apiClient, API_BASE_URL } from '@/lib/api-client';
import type { DicomImage, Point } from '@/types';

// Note: In production, these would be dynamically imported
// import * as cornerstone from '@cornerstonejs/core';
// import * as cornerstoneTools from '@cornerstonejs/tools';
// import * as cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';

interface DicomViewerProps {
  image: DicomImage | null;
  className?: string;
  onImageLoaded?: () => void;
  onError?: (error: Error) => void;
}

export function DicomViewer({
  image,
  className = '',
  onImageLoaded,
  onError,
}: DicomViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [imageData, setImageData] = useState<ImageData | null>(null);

  const {
    viewerState,
    activeTool,
    isDrawing,
    currentPoints,
    strokeColor,
    strokeWidth,
    setZoom,
    setPan,
    setIsDrawing,
    addPoint,
    clearCurrentPoints,
    setImageDimensions,
    setCanvasDimensions,
    canvasDimensions,
    fitToScreen,
    addAnnotation,
    addMeasurement,
    setSelectedAnnotation,
    setSelectedMeasurement,
  } = useViewerStore();

  // Mouse state for pan/zoom
  const lastMousePos = useRef<Point | null>(null);
  const isDragging = useRef(false);

  // Initialize Cornerstone (placeholder - would use actual Cornerstone in production)
  useEffect(() => {
    // In production:
    // cornerstone.init();
    // cornerstoneDICOMImageLoader.init();
    console.log('DicomViewer initialized');
  }, []);

  // Load image
  useEffect(() => {
    if (!image) {
      setImageData(null);
      return;
    }

    const loadImage = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        // In production, use Cornerstone to load DICOM
        // const imageId = `wadouri:${image.imageUrl}`;
        // const loadedImage = await cornerstone.loadImage(imageId);

        // Extract relative path since apiClient has baseURL
        const relativePath = image.imageUrl.replace(API_BASE_URL, '');
        console.log('[DicomViewer] Loading image from:', relativePath);

        // Use apiClient which already has the auth token configured
        const response = await apiClient.getAxiosInstance().get(
          relativePath,
          { responseType: 'blob' }
        );

        console.log('[DicomViewer] Response status:', response.status);
        console.log('[DicomViewer] Response content-type:', response.headers['content-type']);

        // Check if response is an error (e.g., JSON error response)
        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          // Server returned JSON error
          const text = await response.data.text();
          const errorData = JSON.parse(text);
          throw new Error(errorData.detail || 'Server error');
        }

        const blob = new Blob([response.data]);
        console.log('[DicomViewer] Blob size:', blob.size, 'type:', blob.type);

        if (blob.size === 0) {
          throw new Error('Received empty file from server');
        }

        const objectUrl = URL.createObjectURL(blob);

        // Load as regular image
        const img = new window.Image();

        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            console.log('[DicomViewer] Image loaded:', img.width, 'x', img.height);
            // Create canvas to extract image data
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const ctx = tempCanvas.getContext('2d');

            if (ctx) {
              ctx.drawImage(img, 0, 0);
              const data = ctx.getImageData(0, 0, img.width, img.height);
              setImageData(data);
            }

            // Clean up object URL
            URL.revokeObjectURL(objectUrl);
            resolve();
          };
          img.onerror = (e) => {
            console.error('[DicomViewer] Image load error:', e);
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Cannot display image. File may be corrupted or unsupported format.'));
          };
          img.src = objectUrl;
        });

        onImageLoaded?.();
      } catch (error) {
        console.error('[DicomViewer] Load error:', error);
        const err = error instanceof Error ? error : new Error('Unknown error');
        setLoadError(err.message);
        onError?.(err);
      } finally {
        setIsLoading(false);
      }
    };

    loadImage();
  }, [image, onImageLoaded, onError]);

  // Set image dimensions and auto fit-to-screen when image loads
  useEffect(() => {
    if (!imageData) {
      setImageDimensions(null);
      return;
    }

    // Set image dimensions in store
    setImageDimensions({ width: imageData.width, height: imageData.height });

    // Wait for canvas to be sized properly, then fit to screen
    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        setCanvasDimensions({ width: canvas.width, height: canvas.height });
        fitToScreen();
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [imageData, setImageDimensions, setCanvasDimensions, fitToScreen]);

  // Render image to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { zoom, pan, rotation, flip, windowLevel, invert } = viewerState;

    // Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Save context state
    ctx.save();

    // Apply transformations
    ctx.translate(canvas.width / 2 + pan.x, canvas.height / 2 + pan.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(
      flip.horizontal ? -zoom : zoom,
      flip.vertical ? -zoom : zoom
    );

    // Apply window/level and invert
    const processedData = applyWindowLevel(
      imageData,
      windowLevel.center,
      windowLevel.width,
      invert
    );

    // Create temporary canvas for processed image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    const tempCtx = tempCanvas.getContext('2d');

    if (tempCtx) {
      tempCtx.putImageData(processedData, 0, 0);
      ctx.drawImage(
        tempCanvas,
        -imageData.width / 2,
        -imageData.height / 2
      );
    }

    // Restore context state
    ctx.restore();
  }, [imageData, viewerState, canvasDimensions]);

  // Apply window/level adjustment
  const applyWindowLevel = useCallback(
    (data: ImageData, center: number, width: number, invert: boolean): ImageData => {
      const result = new ImageData(
        new Uint8ClampedArray(data.data),
        data.width,
        data.height
      );

      const min = center - width / 2;
      const max = center + width / 2;

      for (let i = 0; i < result.data.length; i += 4) {
        // Get grayscale value (assuming grayscale image)
        let value = result.data[i];

        // Apply window/level
        if (value <= min) {
          value = 0;
        } else if (value >= max) {
          value = 255;
        } else {
          value = ((value - min) / width) * 255;
        }

        // Apply invert
        if (invert) {
          value = 255 - value;
        }

        result.data[i] = value;     // R
        result.data[i + 1] = value; // G
        result.data[i + 2] = value; // B
        // Alpha stays the same
      }

      return result;
    },
    []
  );

  // Check if tool is an annotation tool
  const isAnnotationTool = (tool: string) =>
    ['freehand', 'arrow', 'ellipse', 'rectangle', 'text', 'marker'].includes(tool);

  // Check if tool is a measurement tool
  const isMeasurementTool = (tool: string) =>
    ['distance', 'angle', 'area', 'cobb_angle'].includes(tool);

  // Convert screen coordinates to image coordinates
  const screenToImage = useCallback((screenX: number, screenY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas || !imageData) return { x: screenX, y: screenY };

    const { zoom, pan, rotation, flip } = viewerState;
    const centerX = canvas.width / 2 + pan.x;
    const centerY = canvas.height / 2 + pan.y;

    // Step 1: Translate from screen to canvas center
    let x = screenX - centerX;
    let y = screenY - centerY;

    // Step 2: Reverse rotation
    const radians = (-rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const rotatedX = x * cos - y * sin;
    const rotatedY = x * sin + y * cos;
    x = rotatedX;
    y = rotatedY;

    // Step 3: Reverse scale (zoom and flip)
    const scaleX = flip.horizontal ? -zoom : zoom;
    const scaleY = flip.vertical ? -zoom : zoom;
    x = x / scaleX;
    y = y / scaleY;

    // Step 4: Translate to image coordinates
    const imageX = x + imageData.width / 2;
    const imageY = y + imageData.height / 2;

    return { x: imageX, y: imageY };
  }, [viewerState, imageData]);

  // Convert image coordinates to screen coordinates (for preview while drawing)
  const imageToScreen = useCallback((imageX: number, imageY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas || !imageData) return { x: imageX, y: imageY };

    const { zoom, pan, rotation, flip } = viewerState;
    const centerX = canvas.width / 2 + pan.x;
    const centerY = canvas.height / 2 + pan.y;

    // Step 1: Translate from image center
    let x = imageX - imageData.width / 2;
    let y = imageY - imageData.height / 2;

    // Step 2: Apply scale (zoom and flip)
    const scaleX = flip.horizontal ? -zoom : zoom;
    const scaleY = flip.vertical ? -zoom : zoom;
    x = x * scaleX;
    y = y * scaleY;

    // Step 3: Apply rotation
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const rotatedX = x * cos - y * sin;
    const rotatedY = x * sin + y * cos;
    x = rotatedX;
    y = rotatedY;

    // Step 4: Translate to screen coordinates
    const screenX = x + centerX;
    const screenY = y + centerY;

    return { x: screenX, y: screenY };
  }, [viewerState, imageData]);

  // Get canvas coordinates from mouse event (scales from CSS space to canvas buffer space)
  const getCanvasCoordinates = useCallback((e: React.MouseEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    // Scale from CSS display size to canvas buffer size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  // Mouse event handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const coords = getCanvasCoordinates(e);
      if (!coords) return;

      const screenX = coords.x;
      const screenY = coords.y;

      isDragging.current = true;
      lastMousePos.current = { x: screenX, y: screenY };

      // Clear selection when clicking on canvas (unless drawing)
      if (!isAnnotationTool(activeTool) && !isMeasurementTool(activeTool)) {
        setSelectedAnnotation(null);
        setSelectedMeasurement(null);
      }

      // Start drawing for annotation or measurement tools
      if (isAnnotationTool(activeTool) || isMeasurementTool(activeTool)) {
        const imagePoint = screenToImage(screenX, screenY);

        // For angle and cobb_angle, use multi-click mode
        if (activeTool === 'angle' || activeTool === 'cobb_angle') {
          // If not drawing yet, start
          if (!isDrawing) {
            setIsDrawing(true);
            addPoint(imagePoint);
          } else {
            // Add another point for multi-click tools
            addPoint(imagePoint);

            // Check if we have enough points to complete the measurement
            const requiredPoints = activeTool === 'angle' ? 3 : 4;
            if (currentPoints.length + 1 >= requiredPoints) {
              // Will be handled in handleMouseUp
            }
          }
        } else {
          // Standard drag-based tools
          setIsDrawing(true);
          addPoint(imagePoint);
        }
      }
    },
    [activeTool, isDrawing, currentPoints.length, setIsDrawing, addPoint, screenToImage, getCanvasCoordinates, setSelectedAnnotation, setSelectedMeasurement]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging.current || !lastMousePos.current) return;

      const coords = getCanvasCoordinates(e);
      if (!coords) return;

      const screenX = coords.x;
      const screenY = coords.y;
      const dx = screenX - lastMousePos.current.x;
      const dy = screenY - lastMousePos.current.y;

      if (activeTool === 'pan') {
        setPan({
          x: viewerState.pan.x + dx,
          y: viewerState.pan.y + dy,
        });
      } else if (activeTool === 'zoom') {
        // Zoom based on vertical mouse movement
        const zoomDelta = -dy * 0.01;
        setZoom(viewerState.zoom + zoomDelta);
      } else if (activeTool === 'window_level') {
        // Window: horizontal, Level: vertical
        const newWidth = Math.max(1, viewerState.windowLevel.width + dx);
        const newCenter = viewerState.windowLevel.center + dy;
        useViewerStore.getState().setWindowLevel(newCenter, newWidth);
      } else if (isDrawing) {
        // Convert to image coordinates
        const imagePoint = screenToImage(screenX, screenY);

        // Angle and cobb_angle use click-based input, don't update during drag
        if (activeTool === 'angle' || activeTool === 'cobb_angle') {
          // Don't update points during drag for multi-click tools
          return;
        }

        // For freehand, add all points. For other tools, update the last point
        if (activeTool === 'freehand') {
          addPoint(imagePoint);
        } else if (currentPoints.length > 0) {
          // Update last point for shape tools (they only need start and end points)
          const updatedPoints = [...currentPoints];
          if (updatedPoints.length === 1) {
            updatedPoints.push(imagePoint);
          } else {
            updatedPoints[updatedPoints.length - 1] = imagePoint;
          }
          // Use store to update points
          useViewerStore.setState({ currentPoints: updatedPoints });
        }
      }

      lastMousePos.current = { x: screenX, y: screenY };
    },
    [activeTool, isDrawing, viewerState, currentPoints, setPan, setZoom, addPoint, screenToImage, getCanvasCoordinates]
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    lastMousePos.current = null;

    // For multi-click tools (angle, cobb_angle), don't finish until we have enough points
    if (activeTool === 'angle') {
      // Angle needs 3 points - don't clear until we have them
      if (currentPoints.length < 3) {
        return; // Continue collecting points
      }
    } else if (activeTool === 'cobb_angle') {
      // Cobb angle needs 4 points - don't clear until we have them
      if (currentPoints.length < 4) {
        return; // Continue collecting points
      }
    }

    // Marker and text only need 1 point, others need at least 2
    const minPoints = (activeTool === 'marker' || activeTool === 'text') ? 1 : 2;

    if (isDrawing && currentPoints.length >= minPoints) {
      const id = `${activeTool}-${Date.now()}`;

      // Save annotation
      if (isAnnotationTool(activeTool)) {
        addAnnotation({
          id,
          type: activeTool as 'freehand' | 'arrow' | 'ellipse' | 'rectangle' | 'text' | 'marker',
          points: [...currentPoints],
          color: strokeColor,
          strokeWidth,
          text: activeTool === 'text' ? 'Text' : undefined,
        });
      }

      // Save measurement
      if (isMeasurementTool(activeTool)) {
        // Calculate value based on measurement type
        let value = 0;
        const p1 = currentPoints[0];
        const p2 = currentPoints[currentPoints.length - 1];

        if (activeTool === 'distance') {
          // Distance in pixels (would need pixel spacing for real mm)
          value = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        } else if (activeTool === 'angle' && currentPoints.length >= 3) {
          // Angle calculation: p1 is first point, vertex is middle, p3 is last point
          // Calculate interior angle (0-180°) using dot product formula
          const vertex = currentPoints[1];
          const p3 = currentPoints[2];
          const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
          const v2 = { x: p3.x - vertex.x, y: p3.y - vertex.y };
          const dot = v1.x * v2.x + v1.y * v2.y;
          const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
          const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
          if (mag1 > 0 && mag2 > 0) {
            const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
            value = Math.acos(cosAngle) * (180 / Math.PI);
          }
        } else if (activeTool === 'cobb_angle' && currentPoints.length >= 4) {
          // Cobb angle: angle between two lines
          const angle1 = Math.atan2(currentPoints[1].y - currentPoints[0].y, currentPoints[1].x - currentPoints[0].x);
          const angle2 = Math.atan2(currentPoints[3].y - currentPoints[2].y, currentPoints[3].x - currentPoints[2].x);
          let cobbAngle = Math.abs(angle1 - angle2) * (180 / Math.PI);
          if (cobbAngle > 90) cobbAngle = 180 - cobbAngle;
          value = cobbAngle;
        } else if (activeTool === 'area') {
          // Simple area for rectangle/ellipse (width * height)
          value = Math.abs(p2.x - p1.x) * Math.abs(p2.y - p1.y);
        }

        addMeasurement({
          id,
          type: activeTool as 'distance' | 'angle' | 'area' | 'cobb_angle',
          points: [...currentPoints],
          value,
          unit: activeTool === 'distance' ? 'px' : activeTool === 'angle' || activeTool === 'cobb_angle' ? '°' : 'px²',
        });
      }
    }

    clearCurrentPoints();
    setIsDrawing(false);
  }, [isDrawing, currentPoints, activeTool, strokeColor, strokeWidth, addAnnotation, addMeasurement, clearCurrentPoints, setIsDrawing]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(viewerState.zoom + zoomDelta);
    },
    [viewerState.zoom, setZoom]
  );

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      const viewport = viewportRef.current;
      const canvas = canvasRef.current;
      if (!viewport || !canvas) return;

      canvas.width = viewport.clientWidth;
      canvas.height = viewport.clientHeight;

      // Update canvas dimensions in store and auto fit-to-screen
      setCanvasDimensions({ width: canvas.width, height: canvas.height });

      // Auto fit-to-screen on resize (use getState to ensure latest dimensions)
      useViewerStore.getState().fitToScreen();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setCanvasDimensions]);

  // Get cursor based on active tool
  const getCursor = () => {
    switch (activeTool) {
      case 'pan':
        return isDragging.current ? 'grabbing' : 'grab';
      case 'zoom':
        return 'zoom-in';
      case 'window_level':
        return 'crosshair';
      case 'freehand':
      case 'arrow':
      case 'ellipse':
      case 'rectangle':
      case 'distance':
      case 'angle':
      case 'area':
        return 'crosshair';
      default:
        return 'default';
    }
  };

  return (
    <div
      ref={viewportRef}
      className={`dicom-viewport relative ${className}`}
    >
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="loading-spinner w-8 h-8 text-blue-500" />
            <span className="text-white text-sm">Loading image...</span>
          </div>
        </div>
      )}

      {/* Error message */}
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="text-center p-4">
            <p className="text-red-500 mb-2">Failed to load image</p>
            <p className="text-slate-400 text-sm">{loadError}</p>
          </div>
        </div>
      )}

      {/* No image placeholder */}
      {!image && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-slate-400">No image selected</p>
            <p className="text-slate-500 text-sm mt-1">
              Select an image from the study list
            </p>
          </div>
        </div>
      )}

      {/* Main canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: getCursor() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Image info overlay */}
      {image && !isLoading && (
        <div className="absolute top-2 left-2 text-white text-xs bg-black/50 p-2 rounded">
          <p>Zoom: {(viewerState.zoom * 100).toFixed(0)}%</p>
          <p>WL: {viewerState.windowLevel.center.toFixed(0)} / WW: {viewerState.windowLevel.width.toFixed(0)}</p>
        </div>
      )}

      {/* Drawing preview - shows current points while drawing */}
      {isDrawing && currentPoints.length > 0 && (() => {
        // Convert image coordinates to screen coordinates for preview
        const screenPoints = currentPoints.map(p => imageToScreen(p.x, p.y));
        const p0 = screenPoints[0];
        const pLast = screenPoints[screenPoints.length - 1];

        // Get canvas dimensions for SVG viewBox
        const canvas = canvasRef.current;
        const svgWidth = canvas?.width || 0;
        const svgHeight = canvas?.height || 0;

        return (
        <svg
          className="absolute inset-0 pointer-events-none"
          width={svgWidth || '100%'}
          height={svgHeight || '100%'}
          viewBox={svgWidth && svgHeight ? `0 0 ${svgWidth} ${svgHeight}` : undefined}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%' }}
        >
          {/* Freehand */}
          {activeTool === 'freehand' && (
            <polyline
              points={screenPoints.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
          )}

          {/* Arrow */}
          {activeTool === 'arrow' && screenPoints.length >= 2 && (
            <line
              x1={p0.x}
              y1={p0.y}
              x2={pLast.x}
              y2={pLast.y}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              markerEnd="url(#arrowhead)"
            />
          )}

          {/* Rectangle */}
          {activeTool === 'rectangle' && screenPoints.length >= 2 && (
            <rect
              x={Math.min(p0.x, pLast.x)}
              y={Math.min(p0.y, pLast.y)}
              width={Math.abs(pLast.x - p0.x)}
              height={Math.abs(pLast.y - p0.y)}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
          )}

          {/* Ellipse */}
          {activeTool === 'ellipse' && screenPoints.length >= 2 && (
            <ellipse
              cx={(p0.x + pLast.x) / 2}
              cy={(p0.y + pLast.y) / 2}
              rx={Math.abs(pLast.x - p0.x) / 2}
              ry={Math.abs(pLast.y - p0.y) / 2}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
          )}

          {/* Distance line */}
          {activeTool === 'distance' && screenPoints.length >= 2 && (() => {
            // Default pixel spacing for X-ray images (~0.15 mm/pixel)
            const pixelSpacing = 0.15;
            const distancePx = Math.sqrt(
              Math.pow(currentPoints[currentPoints.length - 1].x - currentPoints[0].x, 2) +
              Math.pow(currentPoints[currentPoints.length - 1].y - currentPoints[0].y, 2)
            );
            const distanceMm = distancePx * pixelSpacing;
            const distanceDisplay = distanceMm >= 10
              ? `${(distanceMm / 10).toFixed(1)} cm`
              : `${distanceMm.toFixed(1)} mm`;
            return (
              <>
                <line
                  x1={p0.x}
                  y1={p0.y}
                  x2={pLast.x}
                  y2={pLast.y}
                  stroke="#00ff00"
                  strokeWidth={2}
                />
                <text
                  x={(p0.x + pLast.x) / 2}
                  y={(p0.y + pLast.y) / 2 - 10}
                  fill="#00ff00"
                  fontSize="12"
                  textAnchor="middle"
                >
                  {distanceDisplay}
                </text>
              </>
            );
          })()}

          {/* Angle - show progress with dots for each clicked point */}
          {activeTool === 'angle' && screenPoints.length >= 1 && (
            <>
              {/* Lines connecting points */}
              <polyline
                points={screenPoints.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="#00ff00"
                strokeWidth={2}
              />
              {/* Show dots for each point */}
              {screenPoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={6}
                  fill={i === 1 ? '#ff0000' : '#00ff00'}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              ))}
              {/* Instructions */}
              <text x={p0.x} y={p0.y - 20} fill="#00ff00" fontSize="12" textAnchor="middle">
                {screenPoints.length === 1 ? 'Click điểm 2 (đỉnh góc)' :
                 screenPoints.length === 2 ? 'Click điểm 3' : ''}
              </text>
            </>
          )}

          {/* Area rectangle */}
          {activeTool === 'area' && screenPoints.length >= 2 && (
            <>
              <rect
                x={Math.min(p0.x, pLast.x)}
                y={Math.min(p0.y, pLast.y)}
                width={Math.abs(pLast.x - p0.x)}
                height={Math.abs(pLast.y - p0.y)}
                fill="rgba(0,255,0,0.1)"
                stroke="#00ff00"
                strokeWidth={2}
              />
              <text
                x={(p0.x + pLast.x) / 2}
                y={(p0.y + pLast.y) / 2}
                fill="#00ff00"
                fontSize="12"
                textAnchor="middle"
              >
                {(Math.abs(currentPoints[currentPoints.length - 1].x - currentPoints[0].x) *
                  Math.abs(currentPoints[currentPoints.length - 1].y - currentPoints[0].y)).toFixed(0)} px²
              </text>
            </>
          )}

          {/* Cobb Angle - show progress with dots and lines */}
          {activeTool === 'cobb_angle' && screenPoints.length >= 1 && (
            <>
              {/* First line (points 0-1) */}
              {screenPoints.length >= 2 && (
                <line
                  x1={screenPoints[0].x}
                  y1={screenPoints[0].y}
                  x2={screenPoints[1].x}
                  y2={screenPoints[1].y}
                  stroke="#00ff00"
                  strokeWidth={2}
                />
              )}
              {/* Second line (points 2-3) */}
              {screenPoints.length >= 4 && (
                <line
                  x1={screenPoints[2].x}
                  y1={screenPoints[2].y}
                  x2={screenPoints[3].x}
                  y2={screenPoints[3].y}
                  stroke="#00ff00"
                  strokeWidth={2}
                />
              )}
              {screenPoints.length === 3 && (
                <line
                  x1={screenPoints[2].x}
                  y1={screenPoints[2].y}
                  x2={screenPoints[2].x}
                  y2={screenPoints[2].y}
                  stroke="#00ff00"
                  strokeWidth={2}
                />
              )}
              {/* Show dots for each point */}
              {screenPoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={6}
                  fill={i < 2 ? '#00ff00' : '#ffff00'}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              ))}
              {/* Instructions */}
              <text x={p0.x} y={p0.y - 20} fill="#00ff00" fontSize="12" textAnchor="middle">
                {screenPoints.length === 1 ? 'Click điểm 2 (cuối đường 1)' :
                 screenPoints.length === 2 ? 'Click điểm 3 (đầu đường 2)' :
                 screenPoints.length === 3 ? 'Click điểm 4 (cuối đường 2)' : ''}
              </text>
            </>
          )}

          {/* Marker */}
          {activeTool === 'marker' && screenPoints.length >= 1 && (
            <circle
              cx={pLast.x}
              cy={pLast.y}
              r={8}
              fill={strokeColor}
              stroke="#ffffff"
              strokeWidth={2}
            />
          )}

          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill={strokeColor} />
            </marker>
          </defs>
        </svg>
        );
      })()}
    </div>
  );
}
