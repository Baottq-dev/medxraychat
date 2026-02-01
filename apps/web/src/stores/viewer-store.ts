import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Point, ViewerState, Annotation, Measurement, MeasurementType } from '@/types';

type ToolMode =
  | 'pan'
  | 'zoom'
  | 'window_level'
  | 'freehand'
  | 'arrow'
  | 'ellipse'
  | 'rectangle'
  | 'text'
  | 'marker'
  | 'distance'
  | 'angle'
  | 'area'
  | 'cobb_angle'
  | 'none';

// History snapshot for undo/redo
interface HistoryState {
  annotations: Annotation[];
  measurements: Measurement[];
}

const MAX_HISTORY_SIZE = 50;

interface ViewerStoreState {
  // Viewer state
  viewerState: ViewerState;

  // Current image tracking
  currentImageId: string | null;

  // Dimensions for fit-to-screen calculation
  imageDimensions: { width: number; height: number } | null;
  canvasDimensions: { width: number; height: number } | null;

  // Tool state
  activeTool: ToolMode;
  isDrawing: boolean;
  currentPoints: Point[];

  // Annotations & Measurements (per image)
  annotationsByImage: Record<string, Annotation[]>;
  measurementsByImage: Record<string, Measurement[]>;
  annotations: Annotation[]; // Current image annotations (derived)
  measurements: Measurement[]; // Current image measurements (derived)
  selectedAnnotationId: string | null;
  selectedMeasurementId: string | null;
  
  // Drawing options
  strokeColor: string;
  strokeWidth: number;
  
  // UI state
  showAnnotations: boolean;
  showMeasurements: boolean;
  showDetections: boolean;
  showHeatmap: boolean;
  heatmapOpacity: number;

  // History state (undo/redo)
  history: HistoryState[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;

  // Actions - Viewer
  setZoom: (zoom: number) => void;
  resetZoom: () => void;
  setPan: (pan: Point) => void;
  setRotation: (rotation: number) => void;
  setFlip: (flip: { horizontal: boolean; vertical: boolean }) => void;
  setWindowLevel: (center: number, width: number) => void;
  setInvert: (invert: boolean) => void;
  resetViewer: () => void;
  fitToScreen: () => void;
  setImageDimensions: (dimensions: { width: number; height: number } | null) => void;
  setCanvasDimensions: (dimensions: { width: number; height: number }) => void;
  setCurrentImageId: (imageId: string | null) => void;
  
  // Actions - Tools
  setActiveTool: (tool: ToolMode) => void;
  setIsDrawing: (isDrawing: boolean) => void;
  addPoint: (point: Point) => void;
  clearCurrentPoints: () => void;
  setStrokeColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  
  // Actions - Annotations
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  deleteAnnotation: (id: string) => void;
  setSelectedAnnotation: (id: string | null) => void;
  setAnnotations: (annotations: Annotation[]) => void;
  
  // Actions - Measurements
  addMeasurement: (measurement: Measurement) => void;
  updateMeasurement: (id: string, updates: Partial<Measurement>) => void;
  deleteMeasurement: (id: string) => void;
  setSelectedMeasurement: (id: string | null) => void;
  setMeasurements: (measurements: Measurement[]) => void;
  
  // Actions - Visibility
  toggleAnnotations: () => void;
  toggleMeasurements: () => void;
  toggleDetections: () => void;
  toggleHeatmap: () => void;
  setHeatmapOpacity: (opacity: number) => void;

  // Actions - History (undo/redo)
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
}

const defaultViewerState: ViewerState = {
  zoom: 1,
  pan: { x: 0, y: 0 },
  rotation: 0,
  flip: { horizontal: false, vertical: false },
  windowLevel: { center: 127, width: 255 },
  invert: false,
};

export const useViewerStore = create<ViewerStoreState>()(
  persist(
    (set, get) => ({
      viewerState: { ...defaultViewerState },
      currentImageId: null,
      imageDimensions: null,
      canvasDimensions: null,
      activeTool: 'pan',
      isDrawing: false,
      currentPoints: [],
      annotationsByImage: {},
      measurementsByImage: {},
      annotations: [],
      measurements: [],
      selectedAnnotationId: null,
      selectedMeasurementId: null,
      strokeColor: '#ffff00',
      strokeWidth: 2,
      showAnnotations: true,
      showMeasurements: true,
      showDetections: true,
      showHeatmap: false,
      heatmapOpacity: 0.5,

      // History state
      history: [],
      historyIndex: -1,
      canUndo: false,
      canRedo: false,

  // Viewer actions
  setZoom: (zoom) =>
    set((state) => ({
      viewerState: { ...state.viewerState, zoom: Math.max(0.1, Math.min(10, zoom)) },
    })),

  setPan: (pan) =>
    set((state) => ({
      viewerState: { ...state.viewerState, pan },
    })),

  setRotation: (rotation) =>
    set((state) => ({
      viewerState: { ...state.viewerState, rotation: rotation % 360 },
    })),

  setFlip: (flip) =>
    set((state) => ({
      viewerState: { ...state.viewerState, flip },
    })),

  setWindowLevel: (center, width) =>
    set((state) => ({
      viewerState: { ...state.viewerState, windowLevel: { center, width } },
    })),

  setInvert: (invert) =>
    set((state) => ({
      viewerState: { ...state.viewerState, invert },
    })),

  resetViewer: () =>
    set({
      viewerState: { ...defaultViewerState },
    }),

  resetZoom: () =>
    set((state) => ({
      viewerState: { ...state.viewerState, zoom: 1, pan: { x: 0, y: 0 } },
    })),

  fitToScreen: () =>
    set((state) => {
      const { imageDimensions, canvasDimensions } = state;

      // Calculate fit zoom if dimensions are available
      let fitZoom = 1;
      if (imageDimensions && canvasDimensions) {
        const padding = 0.95; // 5% padding
        fitZoom = Math.min(
          (canvasDimensions.width / imageDimensions.width) * padding,
          (canvasDimensions.height / imageDimensions.height) * padding
        );
        fitZoom = Math.max(0.1, Math.min(10, fitZoom)); // Clamp between min/max
      }

      return {
        viewerState: { ...state.viewerState, zoom: fitZoom, pan: { x: 0, y: 0 } },
      };
    }),

  setImageDimensions: (dimensions) => set({ imageDimensions: dimensions }),

  setCanvasDimensions: (dimensions) => set({ canvasDimensions: dimensions }),

  setCurrentImageId: (imageId) =>
    set((state) => {
      // Save current annotations/measurements to the old image
      const newAnnotationsByImage = { ...state.annotationsByImage };
      const newMeasurementsByImage = { ...state.measurementsByImage };

      if (state.currentImageId) {
        newAnnotationsByImage[state.currentImageId] = state.annotations;
        newMeasurementsByImage[state.currentImageId] = state.measurements;
      }

      // Load annotations/measurements for the new image
      const newAnnotations = imageId ? (newAnnotationsByImage[imageId] || []) : [];
      const newMeasurements = imageId ? (newMeasurementsByImage[imageId] || []) : [];

      return {
        currentImageId: imageId,
        annotationsByImage: newAnnotationsByImage,
        measurementsByImage: newMeasurementsByImage,
        annotations: newAnnotations,
        measurements: newMeasurements,
        selectedAnnotationId: null,
        selectedMeasurementId: null,
        // Clear history when switching images
        history: [],
        historyIndex: -1,
        canUndo: false,
        canRedo: false,
      };
    }),

  // Tool actions
  setActiveTool: (tool) => set({ activeTool: tool, currentPoints: [], isDrawing: false }),

  setIsDrawing: (isDrawing) => set({ isDrawing }),

  addPoint: (point) =>
    set((state) => ({
      currentPoints: [...state.currentPoints, point],
    })),

  clearCurrentPoints: () => set({ currentPoints: [], isDrawing: false }),

  setStrokeColor: (color) => set({ strokeColor: color }),

  setStrokeWidth: (width) => set({ strokeWidth: width }),

  // Annotation actions
  addAnnotation: (annotation) => {
    // Push history before making changes
    get().pushHistory();
    set((state) => {
      const newAnnotations = [...state.annotations, annotation];
      const newAnnotationsByImage = { ...state.annotationsByImage };
      if (state.currentImageId) {
        newAnnotationsByImage[state.currentImageId] = newAnnotations;
      }
      return {
        annotations: newAnnotations,
        annotationsByImage: newAnnotationsByImage,
      };
    });
  },

  updateAnnotation: (id, updates) =>
    // Note: No history push here since update is called during drag operations
    set((state) => {
      const newAnnotations = state.annotations.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      );
      const newAnnotationsByImage = { ...state.annotationsByImage };
      if (state.currentImageId) {
        newAnnotationsByImage[state.currentImageId] = newAnnotations;
      }
      return {
        annotations: newAnnotations,
        annotationsByImage: newAnnotationsByImage,
      };
    }),

  deleteAnnotation: (id) => {
    // Push history before making changes
    get().pushHistory();
    set((state) => {
      const newAnnotations = state.annotations.filter((a) => a.id !== id);
      const newAnnotationsByImage = { ...state.annotationsByImage };
      if (state.currentImageId) {
        newAnnotationsByImage[state.currentImageId] = newAnnotations;
      }
      return {
        annotations: newAnnotations,
        annotationsByImage: newAnnotationsByImage,
        selectedAnnotationId:
          state.selectedAnnotationId === id ? null : state.selectedAnnotationId,
      };
    });
  },

  setSelectedAnnotation: (id) => set({ selectedAnnotationId: id }),

  setAnnotations: (annotations) =>
    set((state) => {
      const newAnnotationsByImage = { ...state.annotationsByImage };
      if (state.currentImageId) {
        newAnnotationsByImage[state.currentImageId] = annotations;
      }
      return {
        annotations,
        annotationsByImage: newAnnotationsByImage,
      };
    }),

  // Measurement actions
  addMeasurement: (measurement) => {
    // Push history before making changes
    get().pushHistory();
    set((state) => {
      const newMeasurements = [...state.measurements, measurement];
      const newMeasurementsByImage = { ...state.measurementsByImage };
      if (state.currentImageId) {
        newMeasurementsByImage[state.currentImageId] = newMeasurements;
      }
      return {
        measurements: newMeasurements,
        measurementsByImage: newMeasurementsByImage,
      };
    });
  },

  updateMeasurement: (id, updates) =>
    // Note: No history push here since update is called during drag operations
    set((state) => {
      const newMeasurements = state.measurements.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      );
      const newMeasurementsByImage = { ...state.measurementsByImage };
      if (state.currentImageId) {
        newMeasurementsByImage[state.currentImageId] = newMeasurements;
      }
      return {
        measurements: newMeasurements,
        measurementsByImage: newMeasurementsByImage,
      };
    }),

  deleteMeasurement: (id) => {
    // Push history before making changes
    get().pushHistory();
    set((state) => {
      const newMeasurements = state.measurements.filter((m) => m.id !== id);
      const newMeasurementsByImage = { ...state.measurementsByImage };
      if (state.currentImageId) {
        newMeasurementsByImage[state.currentImageId] = newMeasurements;
      }
      return {
        measurements: newMeasurements,
        measurementsByImage: newMeasurementsByImage,
        selectedMeasurementId:
          state.selectedMeasurementId === id ? null : state.selectedMeasurementId,
      };
    });
  },

  setSelectedMeasurement: (id) => set({ selectedMeasurementId: id }),

  setMeasurements: (measurements) =>
    set((state) => {
      const newMeasurementsByImage = { ...state.measurementsByImage };
      if (state.currentImageId) {
        newMeasurementsByImage[state.currentImageId] = measurements;
      }
      return {
        measurements,
        measurementsByImage: newMeasurementsByImage,
      };
    }),

  // Visibility toggles
  toggleAnnotations: () =>
    set((state) => ({ showAnnotations: !state.showAnnotations })),

  toggleMeasurements: () =>
    set((state) => ({ showMeasurements: !state.showMeasurements })),

  toggleDetections: () =>
    set((state) => ({ showDetections: !state.showDetections })),

  toggleHeatmap: () =>
    set((state) => ({ showHeatmap: !state.showHeatmap })),

  setHeatmapOpacity: (opacity: number) =>
    set({ heatmapOpacity: Math.max(0, Math.min(1, opacity)) }),

  // History actions (undo/redo)
  pushHistory: () =>
    set((state) => {
      const currentState: HistoryState = {
        annotations: JSON.parse(JSON.stringify(state.annotations)),
        measurements: JSON.parse(JSON.stringify(state.measurements)),
      };

      // Remove any redo states beyond current index
      const newHistory = state.history.slice(0, state.historyIndex + 1);

      // Add current state
      newHistory.push(currentState);

      // Limit history size
      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
      }

      return {
        history: newHistory,
        historyIndex: newHistory.length - 1,
        canUndo: newHistory.length > 0,
        canRedo: false,
      };
    }),

  undo: () =>
    set((state) => {
      if (state.historyIndex < 0 || state.history.length === 0) {
        return state;
      }

      // If we're at the latest state, save current state first so we can redo to it
      let history = [...state.history];
      let historyIndex = state.historyIndex;

      if (historyIndex === history.length - 1) {
        // Save current state as redo point
        const currentState: HistoryState = {
          annotations: JSON.parse(JSON.stringify(state.annotations)),
          measurements: JSON.parse(JSON.stringify(state.measurements)),
        };
        history.push(currentState);
      }

      // Go back one step
      historyIndex = Math.max(0, historyIndex);
      const previousState = history[historyIndex];

      // Also update byImage records
      const newAnnotations = JSON.parse(JSON.stringify(previousState.annotations));
      const newMeasurements = JSON.parse(JSON.stringify(previousState.measurements));
      const newAnnotationsByImage = { ...state.annotationsByImage };
      const newMeasurementsByImage = { ...state.measurementsByImage };
      if (state.currentImageId) {
        newAnnotationsByImage[state.currentImageId] = newAnnotations;
        newMeasurementsByImage[state.currentImageId] = newMeasurements;
      }

      return {
        history,
        historyIndex: historyIndex - 1,
        annotations: newAnnotations,
        measurements: newMeasurements,
        annotationsByImage: newAnnotationsByImage,
        measurementsByImage: newMeasurementsByImage,
        selectedAnnotationId: null,
        selectedMeasurementId: null,
        canUndo: historyIndex > 0,
        canRedo: true,
      };
    }),

  redo: () =>
    set((state) => {
      const nextIndex = state.historyIndex + 2;
      if (nextIndex >= state.history.length) {
        return state;
      }

      const nextState = state.history[nextIndex];

      // Also update byImage records
      const newAnnotations = JSON.parse(JSON.stringify(nextState.annotations));
      const newMeasurements = JSON.parse(JSON.stringify(nextState.measurements));
      const newAnnotationsByImage = { ...state.annotationsByImage };
      const newMeasurementsByImage = { ...state.measurementsByImage };
      if (state.currentImageId) {
        newAnnotationsByImage[state.currentImageId] = newAnnotations;
        newMeasurementsByImage[state.currentImageId] = newMeasurements;
      }

      return {
        historyIndex: state.historyIndex + 1,
        annotations: newAnnotations,
        measurements: newMeasurements,
        annotationsByImage: newAnnotationsByImage,
        measurementsByImage: newMeasurementsByImage,
        selectedAnnotationId: null,
        selectedMeasurementId: null,
        canUndo: true,
        canRedo: nextIndex + 1 < state.history.length,
      };
    }),

  clearHistory: () =>
    set({
      history: [],
      historyIndex: -1,
      canUndo: false,
      canRedo: false,
    }),
    }),
    {
      name: 'viewer-storage',
      // Only persist annotations and measurements by image, not transient state
      partialize: (state) => ({
        annotationsByImage: state.annotationsByImage,
        measurementsByImage: state.measurementsByImage,
        strokeColor: state.strokeColor,
        strokeWidth: state.strokeWidth,
      }),
    }
  )
);
