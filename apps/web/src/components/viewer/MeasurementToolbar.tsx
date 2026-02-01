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
  Ruler,
  Triangle,
  GitBranch,
  Eye,
  EyeOff,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MeasurementToolbarProps {
  disabled?: boolean;
}

export function MeasurementToolbar({ disabled = false }: MeasurementToolbarProps) {
  const {
    activeTool,
    showMeasurements,
    selectedMeasurementId,
    setActiveTool,
    toggleMeasurements,
    deleteMeasurement,
  } = useViewerStore();

  const measurementTools = [
    { id: 'distance', icon: Ruler, label: 'Đo khoảng cách' },
    { id: 'angle', icon: Triangle, label: 'Đo góc (3 click)' },
    { id: 'cobb_angle', icon: GitBranch, label: 'Góc Cobb (4 click)' },
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
              className={`h-8 w-8 ${showMeasurements
                  ? 'text-green-400 hover:text-green-300'
                  : 'text-slate-500 hover:text-slate-400'
                }`}
              onClick={toggleMeasurements}
            >
              {showMeasurements ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{showMeasurements ? 'Ẩn đo lường' : 'Hiện đo lường'}</p>
          </TooltipContent>
        </Tooltip>

        <div className="border-b border-slate-700 my-1" />

        {/* Measurement tools */}
        {measurementTools.map((tool) => (
          <Tooltip key={tool.id}>
            <TooltipTrigger asChild>
              <Button
                variant={activeTool === tool.id ? 'default' : 'ghost'}
                size="icon"
                className={`h-8 w-8 ${activeTool === tool.id
                    ? 'bg-green-600 hover:bg-green-700'
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

        {/* Delete selected */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20"
              disabled={!selectedMeasurementId}
              onClick={() => {
                if (selectedMeasurementId) {
                  deleteMeasurement(selectedMeasurementId);
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Xóa đo lường đã chọn</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
