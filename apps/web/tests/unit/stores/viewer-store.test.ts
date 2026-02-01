import { describe, it, expect, beforeEach } from 'vitest';
import { useViewerStore } from '@/stores/viewer-store';
import { act } from '@testing-library/react';

describe('Viewer Store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useViewerStore.getState().resetViewerState();
  });

  describe('initial state', () => {
    it('should have default viewer state', () => {
      const { viewerState } = useViewerStore.getState();
      expect(viewerState.zoom).toBe(1);
      expect(viewerState.pan).toEqual({ x: 0, y: 0 });
      expect(viewerState.rotation).toBe(0);
      expect(viewerState.flip.horizontal).toBe(false);
      expect(viewerState.flip.vertical).toBe(false);
      expect(viewerState.invert).toBe(false);
    });

    it('should have pan as default tool', () => {
      const { activeTool } = useViewerStore.getState();
      expect(activeTool).toBe('pan');
    });

    it('should not be drawing initially', () => {
      const { isDrawing } = useViewerStore.getState();
      expect(isDrawing).toBe(false);
    });
  });

  describe('zoom controls', () => {
    it('should set zoom level', () => {
      act(() => {
        useViewerStore.getState().setZoom(2);
      });

      const { viewerState } = useViewerStore.getState();
      expect(viewerState.zoom).toBe(2);
    });

    it('should clamp zoom to minimum', () => {
      act(() => {
        useViewerStore.getState().setZoom(0.05);
      });

      const { viewerState } = useViewerStore.getState();
      expect(viewerState.zoom).toBeGreaterThanOrEqual(0.1);
    });

    it('should clamp zoom to maximum', () => {
      act(() => {
        useViewerStore.getState().setZoom(15);
      });

      const { viewerState } = useViewerStore.getState();
      expect(viewerState.zoom).toBeLessThanOrEqual(10);
    });
  });

  describe('pan controls', () => {
    it('should set pan position', () => {
      act(() => {
        useViewerStore.getState().setPan({ x: 100, y: 50 });
      });

      const { viewerState } = useViewerStore.getState();
      expect(viewerState.pan).toEqual({ x: 100, y: 50 });
    });
  });

  describe('rotation controls', () => {
    it('should set rotation', () => {
      act(() => {
        useViewerStore.getState().setRotation(90);
      });

      const { viewerState } = useViewerStore.getState();
      expect(viewerState.rotation).toBe(90);
    });

    it('should normalize rotation to 0-360', () => {
      act(() => {
        useViewerStore.getState().setRotation(450);
      });

      const { viewerState } = useViewerStore.getState();
      expect(viewerState.rotation).toBe(90);
    });
  });

  describe('flip controls', () => {
    it('should toggle horizontal flip', () => {
      act(() => {
        useViewerStore.getState().toggleFlipHorizontal();
      });

      expect(useViewerStore.getState().viewerState.flip.horizontal).toBe(true);

      act(() => {
        useViewerStore.getState().toggleFlipHorizontal();
      });

      expect(useViewerStore.getState().viewerState.flip.horizontal).toBe(false);
    });

    it('should toggle vertical flip', () => {
      act(() => {
        useViewerStore.getState().toggleFlipVertical();
      });

      expect(useViewerStore.getState().viewerState.flip.vertical).toBe(true);
    });
  });

  describe('window level', () => {
    it('should set window level', () => {
      act(() => {
        useViewerStore.getState().setWindowLevel(200, 400);
      });

      const { viewerState } = useViewerStore.getState();
      expect(viewerState.windowLevel.center).toBe(200);
      expect(viewerState.windowLevel.width).toBe(400);
    });
  });

  describe('invert', () => {
    it('should toggle invert', () => {
      act(() => {
        useViewerStore.getState().toggleInvert();
      });

      expect(useViewerStore.getState().viewerState.invert).toBe(true);

      act(() => {
        useViewerStore.getState().toggleInvert();
      });

      expect(useViewerStore.getState().viewerState.invert).toBe(false);
    });
  });

  describe('tool selection', () => {
    it('should set active tool', () => {
      act(() => {
        useViewerStore.getState().setActiveTool('zoom');
      });

      const { activeTool } = useViewerStore.getState();
      expect(activeTool).toBe('zoom');
    });
  });

  describe('annotations', () => {
    it('should add annotation', () => {
      const annotation = {
        id: '1',
        type: 'arrow' as const,
        points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
        color: '#FF0000',
        strokeWidth: 2,
      };

      act(() => {
        useViewerStore.getState().addAnnotation(annotation);
      });

      const { annotations } = useViewerStore.getState();
      expect(annotations).toHaveLength(1);
      expect(annotations[0]).toEqual(annotation);
    });

    it('should remove annotation', () => {
      const annotation = {
        id: '1',
        type: 'arrow' as const,
        points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
        color: '#FF0000',
        strokeWidth: 2,
      };

      act(() => {
        useViewerStore.getState().addAnnotation(annotation);
        useViewerStore.getState().removeAnnotation('1');
      });

      const { annotations } = useViewerStore.getState();
      expect(annotations).toHaveLength(0);
    });

    it('should clear all annotations', () => {
      act(() => {
        useViewerStore.getState().addAnnotation({
          id: '1',
          type: 'arrow' as const,
          points: [],
          color: '#FF0000',
          strokeWidth: 2,
        });
        useViewerStore.getState().addAnnotation({
          id: '2',
          type: 'freehand' as const,
          points: [],
          color: '#00FF00',
          strokeWidth: 2,
        });
        useViewerStore.getState().clearAnnotations();
      });

      const { annotations } = useViewerStore.getState();
      expect(annotations).toHaveLength(0);
    });
  });

  describe('measurements', () => {
    it('should add measurement', () => {
      const measurement = {
        id: '1',
        type: 'distance' as const,
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        value: 100,
        unit: 'mm',
      };

      act(() => {
        useViewerStore.getState().addMeasurement(measurement);
      });

      const { measurements } = useViewerStore.getState();
      expect(measurements).toHaveLength(1);
      expect(measurements[0]).toEqual(measurement);
    });
  });

  describe('reset', () => {
    it('should reset all viewer state', () => {
      // Change some state
      act(() => {
        useViewerStore.getState().setZoom(2);
        useViewerStore.getState().setPan({ x: 100, y: 100 });
        useViewerStore.getState().setRotation(90);
        useViewerStore.getState().toggleInvert();
      });

      // Reset
      act(() => {
        useViewerStore.getState().resetViewerState();
      });

      const { viewerState } = useViewerStore.getState();
      expect(viewerState.zoom).toBe(1);
      expect(viewerState.pan).toEqual({ x: 0, y: 0 });
      expect(viewerState.rotation).toBe(0);
      expect(viewerState.invert).toBe(false);
    });
  });
});
