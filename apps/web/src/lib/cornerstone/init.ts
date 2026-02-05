'use client';

/**
 * Cornerstone.js 3D initialization
 * Full integration for medical DICOM viewing
 */

import {
  init as initCore,
  RenderingEngine,
  Enums as CoreEnums,
  cache,
  metaData,
  imageLoader,
  type Types,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';

const {
  ToolGroupManager,
  Enums: ToolEnums,
  addTool,
  PanTool,
  ZoomTool,
  WindowLevelTool,
  StackScrollTool,
  LengthTool,
  AngleTool,
  RectangleROITool,
  EllipticalROITool,
  PlanarFreehandROITool,
  ArrowAnnotateTool,
  CobbAngleTool,
  BidirectionalTool,
  annotation,
} = cornerstoneTools;

let initialized = false;
let renderingEngine: RenderingEngine | null = null;

export interface CornerstoneConfig {
  enableWebGL2: boolean;
  gpuTier?: number;
  preferSizeOverAccuracy?: boolean;
  maxWebWorkers?: number;
}

const defaultConfig: CornerstoneConfig = {
  enableWebGL2: true,
  gpuTier: 2,
  preferSizeOverAccuracy: false,
  maxWebWorkers: 4,
};

export const RENDERING_ENGINE_ID = 'medxray-engine';
export const TOOL_GROUP_ID = 'medxray-tools';

/**
 * Initialize Cornerstone.js 3D with all required tools
 */
export async function initCornerstone(config: Partial<CornerstoneConfig> = {}): Promise<void> {
  if (initialized) {
    console.log('Cornerstone already initialized');
    return;
  }

  const mergedConfig = { ...defaultConfig, ...config };

  try {
    // Initialize core rendering engine
    initCore({
      gpuTier: mergedConfig.gpuTier ? { tier: mergedConfig.gpuTier } : undefined,
      rendering: {
        preferSizeOverAccuracy: mergedConfig.preferSizeOverAccuracy,
        useCPURendering: false,
      },
      debug: {},
    });

    // Initialize DICOM Image Loader
    const maxWebWorkers = mergedConfig.maxWebWorkers ??
      (typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? Math.min(navigator.hardwareConcurrency, 4)
        : 2);

    cornerstoneDICOMImageLoader.init({
      maxWebWorkers,
      decodeConfig: {
        convertFloatPixelDataToInt: false,
        use16BitDataType: true,
      },
    });

    // Register all tools
    registerTools();

    // Create tool group with default configuration
    createDefaultToolGroup();

    // Create rendering engine
    renderingEngine = new RenderingEngine(RENDERING_ENGINE_ID);

    initialized = true;
    console.log('Cornerstone.js 3D initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Cornerstone.js:', error);
    throw error;
  }
}

/**
 * Register all measurement and annotation tools
 */
function registerTools(): void {
  // Navigation tools
  addTool(PanTool);
  addTool(ZoomTool);
  addTool(WindowLevelTool);
  addTool(StackScrollTool);

  // Measurement tools
  addTool(LengthTool);
  addTool(AngleTool);
  addTool(CobbAngleTool);
  addTool(BidirectionalTool);

  // Annotation tools
  addTool(RectangleROITool);
  addTool(EllipticalROITool);
  addTool(PlanarFreehandROITool);
  addTool(ArrowAnnotateTool);
}

/**
 * Create default tool group with standard bindings
 */
function createDefaultToolGroup(): cornerstoneTools.Types.IToolGroup | undefined {
  const toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID);

  if (!toolGroup) {
    console.error('Failed to create tool group');
    return undefined;
  }

  // Add all tools to group
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(AngleTool.toolName);
  toolGroup.addTool(CobbAngleTool.toolName);
  toolGroup.addTool(BidirectionalTool.toolName);
  toolGroup.addTool(RectangleROITool.toolName);
  toolGroup.addTool(EllipticalROITool.toolName);
  toolGroup.addTool(PlanarFreehandROITool.toolName);
  toolGroup.addTool(ArrowAnnotateTool.toolName);

  // Set default tool bindings
  // Pan on left click
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
  });

  // Zoom on right click
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: ToolEnums.MouseBindings.Secondary }],
  });

  // Window/Level on middle click
  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [{ mouseButton: ToolEnums.MouseBindings.Auxiliary }],
  });

  // Scroll wheel for stack navigation
  toolGroup.setToolActive(StackScrollTool.toolName);

  return toolGroup;
}

/**
 * Tool names for external reference
 */
export const TOOL_NAMES = {
  PAN: PanTool.toolName,
  ZOOM: ZoomTool.toolName,
  WINDOW_LEVEL: WindowLevelTool.toolName,
  SCROLL: StackScrollTool.toolName,
  LENGTH: LengthTool.toolName,
  ANGLE: AngleTool.toolName,
  COBB_ANGLE: CobbAngleTool.toolName,
  BIDIRECTIONAL: BidirectionalTool.toolName,
  RECTANGLE_ROI: RectangleROITool.toolName,
  ELLIPSE_ROI: EllipticalROITool.toolName,
  FREEHAND_ROI: PlanarFreehandROITool.toolName,
  ARROW: ArrowAnnotateTool.toolName,
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

/**
 * Get the default tool group
 */
export function getToolGroup(toolGroupId = TOOL_GROUP_ID): cornerstoneTools.Types.IToolGroup | undefined {
  return ToolGroupManager.getToolGroup(toolGroupId);
}

/**
 * Get the rendering engine
 */
export function getRenderingEngine(): RenderingEngine | null {
  return renderingEngine;
}

/**
 * Check if Cornerstone is initialized
 */
export function isInitialized(): boolean {
  return initialized;
}

/**
 * Set the active tool for the primary mouse button
 */
export function setActiveTool(toolName: ToolName, toolGroupId = TOOL_GROUP_ID): void {
  const toolGroup = getToolGroup(toolGroupId);
  if (!toolGroup) {
    console.warn('Tool group not found:', toolGroupId);
    return;
  }

  // Get current primary tool and make it passive
  const currentTool = toolGroup.getActivePrimaryMouseButtonTool();
  if (currentTool) {
    toolGroup.setToolPassive(currentTool);
  }

  // Activate new tool
  toolGroup.setToolActive(toolName, {
    bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
  });
}

/**
 * Create a stack viewport for displaying DICOM images
 */
export function createStackViewport(
  element: HTMLDivElement,
  viewportId: string
): Types.IStackViewport | null {
  if (!renderingEngine) {
    console.error('Rendering engine not initialized');
    return null;
  }

  const viewportInput: Types.PublicViewportInput = {
    viewportId,
    element,
    type: CoreEnums.ViewportType.STACK,
  };

  renderingEngine.enableElement(viewportInput);

  // Add viewport to tool group
  const toolGroup = getToolGroup();
  toolGroup?.addViewport(viewportId, RENDERING_ENGINE_ID);

  return renderingEngine.getViewport(viewportId) as Types.IStackViewport;
}

/**
 * Load and display a DICOM image in a viewport
 */
export async function loadAndDisplayImage(
  viewport: Types.IStackViewport,
  imageUrl: string
): Promise<void> {
  // Create imageId based on URL type
  let imageId: string;

  if (imageUrl.endsWith('.dcm') || imageUrl.includes('dicom')) {
    imageId = `wadouri:${imageUrl}`;
  } else {
    // For regular images (PNG, JPEG), use web image loader
    imageId = `web:${imageUrl}`;
  }

  await viewport.setStack([imageId]);
  viewport.render();
}

/**
 * Load a DICOM image and return the image object
 */
export async function loadDicomImage(imageUrl: string): Promise<Types.IImage> {
  const imageId = imageUrl.startsWith('wadouri:') ? imageUrl : `wadouri:${imageUrl}`;
  return await imageLoader.loadImage(imageId);
}

/**
 * Get DICOM metadata for an image
 */
export function getDicomMetadata(imageId: string, type: string): unknown {
  return metaData.get(type, imageId);
}

/**
 * Get all annotations
 */
export function getAnnotations(): unknown[] {
  return annotation.state.getAllAnnotations();
}

/**
 * Remove an annotation by ID
 */
export function removeAnnotation(annotationUID: string): void {
  annotation.state.removeAnnotation(annotationUID);
}

/**
 * Clear all annotations
 */
export function clearAllAnnotations(): void {
  annotation.state.removeAllAnnotations();
}

/**
 * Destroy a viewport
 */
export function destroyViewport(viewportId: string): void {
  if (!renderingEngine) return;

  const toolGroup = getToolGroup();
  toolGroup?.removeViewports(RENDERING_ENGINE_ID, viewportId);

  renderingEngine.disableElement(viewportId);
}

/**
 * Clean up all Cornerstone resources
 */
export function cleanup(): void {
  if (!initialized) return;

  // Destroy tool group
  ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID);

  // Destroy rendering engine
  renderingEngine?.destroy();
  renderingEngine = null;

  // Clear cache
  cache.purgeCache();

  initialized = false;
  console.log('Cornerstone.js cleaned up');
}

/**
 * Reset viewport to default view
 */
export function resetViewport(viewportId: string): void {
  const viewport = renderingEngine?.getViewport(viewportId);
  if (viewport) {
    viewport.resetCamera();
    viewport.render();
  }
}

/**
 * Set viewport properties
 */
export function setViewportProperties(
  viewportId: string,
  properties: Partial<{
    invert: boolean;
    rotation: number;
    flipHorizontal: boolean;
    flipVertical: boolean;
  }>
): void {
  const viewport = renderingEngine?.getViewport(viewportId) as Types.IStackViewport;
  if (viewport) {
    viewport.setProperties(properties);
    viewport.render();
  }
}

/**
 * Get viewport properties
 */
export function getViewportProperties(viewportId: string): unknown {
  const viewport = renderingEngine?.getViewport(viewportId) as Types.IStackViewport;
  return viewport?.getProperties();
}

/**
 * Set VOI (Value of Interest) for window/level
 */
export function setVOI(
  viewportId: string,
  windowWidth: number,
  windowCenter: number
): void {
  const viewport = renderingEngine?.getViewport(viewportId) as Types.IStackViewport;
  if (viewport) {
    viewport.setProperties({
      voiRange: {
        lower: windowCenter - windowWidth / 2,
        upper: windowCenter + windowWidth / 2,
      },
    });
    viewport.render();
  }
}

/**
 * Get current VOI values
 */
export function getVOI(viewportId: string): { windowWidth: number; windowCenter: number } | null {
  const viewport = renderingEngine?.getViewport(viewportId) as Types.IStackViewport;
  const properties = viewport?.getProperties();

  if (properties?.voiRange) {
    const { lower, upper } = properties.voiRange;
    return {
      windowWidth: upper - lower,
      windowCenter: (upper + lower) / 2,
    };
  }

  return null;
}

export default {
  initCornerstone,
  getToolGroup,
  getRenderingEngine,
  isInitialized,
  cleanup,
  setActiveTool,
  createStackViewport,
  loadAndDisplayImage,
  loadDicomImage,
  getDicomMetadata,
  getAnnotations,
  removeAnnotation,
  clearAllAnnotations,
  destroyViewport,
  resetViewport,
  setViewportProperties,
  getViewportProperties,
  setVOI,
  getVOI,
  TOOL_NAMES,
  RENDERING_ENGINE_ID,
  TOOL_GROUP_ID,
};
