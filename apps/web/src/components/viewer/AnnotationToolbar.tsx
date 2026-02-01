'use client';

import { useViewerStore } from '@/stores';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Pencil,
  ArrowUp,
  Circle,
  Square,
  Type,
  MapPin,
  Palette,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ANNOTATION_COLORS = [
  '#ffff00', // Yellow
  '#ff0000', // Red
  '#00ff00', // Green
  '#00ffff', // Cyan
  '#ff00ff', // Magenta
  '#ff8800', // Orange
  '#ffffff', // White
];

interface AnnotationToolbarProps {
  disabled?: boolean;
}

export function AnnotationToolbar({ disabled = false }: AnnotationToolbarProps) {
  const {
    activeTool,
    strokeColor,
    strokeWidth,
    showAnnotations,
    selectedAnnotationId,
    setActiveTool,
    setStrokeColor,
    setStrokeWidth,
    toggleAnnotations,
    deleteAnnotation,
  } = useViewerStore();

  const annotationTools = [
    { id: 'freehand', icon: Pencil, label: 'Vẽ tự do' },
    { id: 'arrow', icon: ArrowUp, label: 'Mũi tên' },
    { id: 'ellipse', icon: Circle, label: 'Hình elip' },
    { id: 'rectangle', icon: Square, label: 'Hình chữ nhật' },
    { id: 'text', icon: Type, label: 'Văn bản' },
    { id: 'marker', icon: MapPin, label: 'Đánh dấu' },
  ];

  return (
    <TooltipProvider>
      <div className={cn(
        "flex flex-col gap-2 p-2 bg-slate-800 border-r border-slate-700",
        disabled && "opacity-50 pointer-events-none"
      )}>
        {/* Visibility toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${showAnnotations
                  ? 'text-blue-400 hover:text-blue-300'
                  : 'text-slate-500 hover:text-slate-400'
                }`}
              onClick={toggleAnnotations}
            >
              {showAnnotations ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{showAnnotations ? 'Ẩn annotation' : 'Hiện annotation'}</p>
          </TooltipContent>
        </Tooltip>

        <div className="border-b border-slate-700 my-1" />

        {/* Annotation tools */}
        {annotationTools.map((tool) => (
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
            <TooltipContent side="right">
              <p>{tool.label}</p>
            </TooltipContent>
          </Tooltip>
        ))}

        <div className="border-b border-slate-700 my-1" />

        {/* Color picker */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-700"
              >
                <Palette className="h-4 w-4" />
              </Button>
              <div
                className="absolute bottom-0 right-0 w-3 h-3 rounded-full border border-slate-600"
                style={{ backgroundColor: strokeColor }}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="p-2">
            <div className="flex gap-1">
              {ANNOTATION_COLORS.map((color) => (
                <button
                  key={color}
                  className={`w-6 h-6 rounded border-2 ${strokeColor === color
                      ? 'border-white'
                      : 'border-transparent hover:border-slate-400'
                    }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setStrokeColor(color)}
                />
              ))}
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Stroke width */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-slate-500">Width</span>
          <div className="flex flex-col gap-1">
            {[1, 2, 3, 4].map((width) => (
              <button
                key={width}
                className={`w-8 h-4 flex items-center justify-center rounded ${strokeWidth === width
                    ? 'bg-blue-600'
                    : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                onClick={() => setStrokeWidth(width)}
              >
                <div
                  className="rounded-full bg-white"
                  style={{ width: `${width * 6}px`, height: `${width}px` }}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="border-b border-slate-700 my-1" />

        {/* Delete selected */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20"
              disabled={!selectedAnnotationId}
              onClick={() => {
                if (selectedAnnotationId) {
                  deleteAnnotation(selectedAnnotationId);
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Xóa annotation đã chọn</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
