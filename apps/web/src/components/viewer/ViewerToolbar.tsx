'use client';

import { useViewerStore } from '@/stores';
import { Button } from '@/components/ui/button';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  Maximize,
  RefreshCw,
  Contrast,
  Move,
  Search,
  Undo2,
  Redo2,
  Focus,
  Box,
  Flame,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ViewerToolbarProps {
  disabled?: boolean;
}

export function ViewerToolbar({ disabled = false }: ViewerToolbarProps) {
  const {
    viewerState,
    activeTool,
    showDetections,
    showHeatmap,
    heatmapOpacity,
    setZoom,
    setRotation,
    setFlip,
    setInvert,
    resetViewer,
    resetZoom,
    fitToScreen,
    setActiveTool,
    toggleDetections,
    toggleHeatmap,
    setHeatmapOpacity,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useViewerStore();

  const tools = [
    { id: 'pan', icon: Move, label: 'Pan (kéo ảnh)' },
    { id: 'zoom', icon: Search, label: 'Zoom (phóng to/thu nhỏ)' },
    { id: 'window_level', icon: Contrast, label: 'Window/Level' },
  ];

  return (
    <TooltipProvider>
      <div className={cn(
        "flex items-center gap-1 p-2 bg-slate-800 border-b border-slate-700",
        disabled && "opacity-50 pointer-events-none"
      )}>
        {/* Undo/Redo */}
        <div className="flex items-center gap-1 mr-4 border-r border-slate-700 pr-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8",
                  canUndo
                    ? "text-slate-300 hover:text-white hover:bg-slate-700"
                    : "text-slate-600 cursor-not-allowed"
                )}
                onClick={undo}
                disabled={!canUndo}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Hoàn tác (Ctrl+Z)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8",
                  canRedo
                    ? "text-slate-300 hover:text-white hover:bg-slate-700"
                    : "text-slate-600 cursor-not-allowed"
                )}
                onClick={redo}
                disabled={!canRedo}
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Làm lại (Ctrl+Y)</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Tool selection */}
        <div className="flex items-center gap-1 mr-4 border-r border-slate-700 pr-4">
          {tools.map((tool) => (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={activeTool === tool.id ? 'default' : 'ghost'}
                  size="icon"
                  className={`h-8 w-8 ${activeTool === tool.id
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                  onClick={() => setActiveTool(tool.id as typeof activeTool)}
                >
                  <tool.icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{tool.label}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 mr-4 border-r border-slate-700 pr-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-700"
                onClick={() => setZoom(viewerState.zoom + 0.25)}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Phóng to (+)</p>
            </TooltipContent>
          </Tooltip>

          <span className="text-xs text-slate-400 min-w-[48px] text-center">
            {(viewerState.zoom * 100).toFixed(0)}%
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-700"
                onClick={() => setZoom(viewerState.zoom - 0.25)}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Thu nhỏ (-)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-700"
                onClick={fitToScreen}
              >
                <Maximize className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Fit to screen</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-700"
                onClick={resetZoom}
              >
                <Focus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reset zoom (100%)</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Rotation controls */}
        <div className="flex items-center gap-1 mr-4 border-r border-slate-700 pr-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-700"
                onClick={() => setRotation(viewerState.rotation - 90)}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Xoay trái 90°</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-700"
                onClick={() => setRotation(viewerState.rotation + 90)}
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Xoay phải 90°</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Flip controls */}
        <div className="flex items-center gap-1 mr-4 border-r border-slate-700 pr-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewerState.flip.horizontal ? 'default' : 'ghost'}
                size="icon"
                className={`h-8 w-8 ${viewerState.flip.horizontal
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                onClick={() =>
                  setFlip({
                    ...viewerState.flip,
                    horizontal: !viewerState.flip.horizontal,
                  })
                }
              >
                <FlipHorizontal className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Lật ngang</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewerState.flip.vertical ? 'default' : 'ghost'}
                size="icon"
                className={`h-8 w-8 ${viewerState.flip.vertical
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                onClick={() =>
                  setFlip({
                    ...viewerState.flip,
                    vertical: !viewerState.flip.vertical,
                  })
                }
              >
                <FlipVertical className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Lật dọc</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Invert */}
        <div className="flex items-center gap-1 mr-4 border-r border-slate-700 pr-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewerState.invert ? 'default' : 'ghost'}
                size="icon"
                className={`h-8 w-8 ${viewerState.invert
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                onClick={() => setInvert(!viewerState.invert)}
              >
                <Contrast className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Đảo màu</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* AI Overlays */}
        <div className="flex items-center gap-1 mr-4 border-r border-slate-700 pr-4">
          {/* Toggle BBox */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showDetections ? 'default' : 'ghost'}
                size="icon"
                className={`h-8 w-8 ${showDetections
                  ? 'bg-yellow-600 hover:bg-yellow-700'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                onClick={toggleDetections}
              >
                <Box className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Hiện/Ẩn BBox ({showDetections ? 'Bật' : 'Tắt'})</p>
            </TooltipContent>
          </Tooltip>

          {/* Toggle Heatmap */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showHeatmap ? 'default' : 'ghost'}
                size="icon"
                className={`h-8 w-8 ${showHeatmap
                  ? 'bg-orange-600 hover:bg-orange-700'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                onClick={toggleHeatmap}
              >
                <Flame className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Hiện/Ẩn Heatmap ({showHeatmap ? 'Bật' : 'Tắt'})</p>
            </TooltipContent>
          </Tooltip>

          {/* Heatmap Opacity Slider */}
          {showHeatmap && (
            <div className="flex items-center gap-2 ml-2">
              <span className="text-xs text-slate-400">Độ đậm:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={heatmapOpacity * 100}
                onChange={(e) => setHeatmapOpacity(Number(e.target.value) / 100)}
                className="w-20 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <span className="text-xs text-slate-400 w-8">{Math.round(heatmapOpacity * 100)}%</span>
            </div>
          )}
        </div>

        {/* Reset */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-700"
              onClick={resetViewer}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Reset về mặc định</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
