'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useViewerStore, useAuthStore } from '@/stores';
import { useChatStore } from '@/stores';
import { API_BASE_URL } from '@/lib/api-client';

interface HeatmapOverlayProps {
  className?: string;
}

export function HeatmapOverlay({ className = '' }: HeatmapOverlayProps) {
  const {
    showHeatmap,
    heatmapOpacity,
    viewerState,
    imageDimensions,
    canvasDimensions,
    currentImageId,
  } = useViewerStore();
  const { currentAnalysis } = useChatStore();
  const { tokens } = useAuthStore();
  const accessToken = tokens?.accessToken;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [heatmapImage, setHeatmapImage] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heatmapUrlRef = useRef<string | null>(null);

  // Fetch heatmap when image changes and analysis exists
  const fetchHeatmap = useCallback(async () => {
    console.log('fetchHeatmap called:', { currentImageId, hasToken: !!accessToken });

    if (!currentImageId || !accessToken) {
      console.log('fetchHeatmap: missing required params');
      setHeatmapImage(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = `${API_BASE_URL}/ai/heatmap/${currentImageId}`;
      console.log('Fetching heatmap from:', url);
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      console.log('Response status:', response.status, 'ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Failed to fetch heatmap: ${response.status} - ${errorText}`);
      }

      const blob = await response.blob();
      console.log('Heatmap blob received:', blob.size, 'bytes, type:', blob.type);

      if (blob.size === 0) {
        throw new Error('Received empty heatmap');
      }

      const blobUrl = URL.createObjectURL(blob);

      // Clean up old URL
      if (heatmapUrlRef.current) {
        URL.revokeObjectURL(heatmapUrlRef.current);
      }
      heatmapUrlRef.current = blobUrl;

      // Load image
      const img = new Image();
      img.onload = () => {
        console.log('Heatmap image loaded:', img.naturalWidth, 'x', img.naturalHeight);
        setHeatmapImage(img);
      };
      img.onerror = () => {
        setError('Failed to load heatmap image');
      };
      img.src = blobUrl;

    } catch (err) {
      console.error('Error fetching heatmap:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch heatmap');
    } finally {
      setLoading(false);
    }
  }, [currentImageId, accessToken]);

  // Track which image the current heatmap is for
  const currentHeatmapImageId = useRef<string | null>(null);

  // Clear heatmap immediately when image changes
  useEffect(() => {
    // If image changed, clear old heatmap immediately
    if (currentHeatmapImageId.current !== currentImageId) {
      console.log('Image changed, clearing old heatmap:', currentHeatmapImageId.current, '->', currentImageId);

      // Clear the canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }

      // Clean up old URL and image
      if (heatmapUrlRef.current) {
        URL.revokeObjectURL(heatmapUrlRef.current);
        heatmapUrlRef.current = null;
      }
      setHeatmapImage(null);
      setError(null);

      // Update tracking ref
      currentHeatmapImageId.current = currentImageId;
    }
  }, [currentImageId]);

  // Fetch heatmap when we have analysis for current image
  useEffect(() => {
    console.log('HeatmapOverlay fetch check:', {
      showHeatmap,
      hasAnalysis: !!currentAnalysis,
      currentImageId,
      hasToken: !!accessToken,
      hasHeatmapImage: !!heatmapImage,
    });

    // Only fetch if we have analysis and current image matches
    if (currentAnalysis && currentImageId && !heatmapImage && !loading) {
      console.log('Fetching heatmap for:', currentImageId);
      fetchHeatmap();
    }

    // Cleanup on unmount only
    return () => {
      if (heatmapUrlRef.current) {
        URL.revokeObjectURL(heatmapUrlRef.current);
      }
    };
  }, [currentAnalysis, currentImageId, fetchHeatmap, accessToken, heatmapImage, loading]);

  // Render heatmap to canvas - same transform logic as DicomViewer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Update canvas size
    canvas.width = canvasDimensions?.width || 0;
    canvas.height = canvasDimensions?.height || 0;

    // Clear canvas first
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Don't draw if conditions not met
    if (!heatmapImage || !showHeatmap || !currentAnalysis) return;
    if (!imageDimensions || !canvasDimensions) return;

    const { zoom, pan, rotation, flip } = viewerState;

    // Save context state
    ctx.save();

    // Apply transformations - SAME as DicomViewer
    ctx.translate(canvas.width / 2 + pan.x, canvas.height / 2 + pan.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(
      flip.horizontal ? -zoom : zoom,
      flip.vertical ? -zoom : zoom
    );

    // Set global alpha for opacity
    ctx.globalAlpha = heatmapOpacity;

    // Draw heatmap at the same position as DicomViewer draws the image
    // Use imageDimensions (original X-ray size) for positioning
    ctx.drawImage(
      heatmapImage,
      -imageDimensions.width / 2,
      -imageDimensions.height / 2,
      imageDimensions.width,
      imageDimensions.height
    );

    // Restore context state
    ctx.restore();

  }, [heatmapImage, showHeatmap, viewerState, imageDimensions, canvasDimensions, heatmapOpacity, currentAnalysis]);

  if (!showHeatmap) {
    return null;
  }

  if (!imageDimensions || !canvasDimensions) {
    return null;
  }

  return (
    <div
      className={`annotation-layer ${className}`}
      style={{
        width: canvasDimensions.width,
        height: canvasDimensions.height,
        pointerEvents: 'none',
      }}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-xs text-white bg-black/50 px-2 py-1 rounded">
            Loading heatmap...
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-xs text-red-400 bg-black/50 px-2 py-1 rounded">
            {error}
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ pointerEvents: 'none' }}
      />
    </div>
  );
}
