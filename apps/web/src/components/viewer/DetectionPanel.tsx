'use client';

import { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle,
  Info,
  Filter,
  SortAsc,
  SortDesc,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getBboxColor } from '@/lib/colors';
import type { Detection } from '@/types';

interface DetectionPanelProps {
  detections: Detection[];
  hoveredDetection?: Detection | null;
  selectedDetection?: Detection | null;
  onDetectionHover?: (detection: Detection | null) => void;
  onDetectionSelect?: (detection: Detection | null) => void;
  onVisibilityToggle?: (detectionId: string, visible: boolean) => void;
  className?: string;
}

type SortField = 'confidence' | 'className';
type SortOrder = 'asc' | 'desc';

export function DetectionPanel({
  detections,
  hoveredDetection,
  selectedDetection,
  onDetectionHover,
  onDetectionSelect,
  onVisibilityToggle,
  className,
}: DetectionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [hiddenDetections, setHiddenDetections] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('confidence');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterMinConfidence, setFilterMinConfidence] = useState(0);

  // Sort and filter detections
  const sortedDetections = useMemo(() => {
    let filtered = detections.filter(d => d.confidence >= filterMinConfidence);

    return filtered.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'confidence') {
        comparison = a.confidence - b.confidence;
      } else {
        comparison = a.className.localeCompare(b.className);
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [detections, sortField, sortOrder, filterMinConfidence]);

  // Group detections by severity
  const { critical, warning, normal } = useMemo(() => {
    const critical: Detection[] = [];
    const warning: Detection[] = [];
    const normal: Detection[] = [];

    sortedDetections.forEach(det => {
      if (det.confidence >= 0.8) {
        critical.push(det);
      } else if (det.confidence >= 0.5) {
        warning.push(det);
      } else {
        normal.push(det);
      }
    });

    return { critical, warning, normal };
  }, [sortedDetections]);

  const handleToggleVisibility = (detectionId: string) => {
    const newHidden = new Set(hiddenDetections);
    if (newHidden.has(detectionId)) {
      newHidden.delete(detectionId);
    } else {
      newHidden.add(detectionId);
    }
    setHiddenDetections(newHidden);
    onVisibilityToggle?.(detectionId, !newHidden.has(detectionId));
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  if (detections.length === 0) {
    return (
      <div className={cn('bg-slate-800 rounded-lg p-4', className)}>
        <div className="flex items-center gap-2 text-slate-400">
          <Info className="h-5 w-5" />
          <span>Không có phát hiện nào</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-slate-800 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 bg-slate-700 cursor-pointer hover:bg-slate-600 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">Phát hiện</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white">
            {detections.length}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-slate-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-slate-400" />
        )}
      </div>

      {isExpanded && (
        <>
          {/* Controls */}
          <div className="flex items-center gap-2 p-2 border-b border-slate-700">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => handleSort('confidence')}
            >
              {sortField === 'confidence' && sortOrder === 'desc' ? (
                <SortDesc className="h-3 w-3 mr-1" />
              ) : (
                <SortAsc className="h-3 w-3 mr-1" />
              )}
              Độ tin cậy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => handleSort('className')}
            >
              {sortField === 'className' && sortOrder === 'desc' ? (
                <SortDesc className="h-3 w-3 mr-1" />
              ) : (
                <SortAsc className="h-3 w-3 mr-1" />
              )}
              Tên
            </Button>
            <div className="flex-1" />
            <select
              className="text-xs bg-slate-700 border-none rounded px-2 py-1 text-slate-300"
              value={filterMinConfidence}
              onChange={(e) => setFilterMinConfidence(parseFloat(e.target.value))}
            >
              <option value={0}>Tất cả</option>
              <option value={0.3}>≥30%</option>
              <option value={0.5}>≥50%</option>
              <option value={0.7}>≥70%</option>
            </select>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 p-2 border-b border-slate-700">
            <SummaryCard
              icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
              label="Cao"
              count={critical.length}
              color="text-red-500"
            />
            <SummaryCard
              icon={<AlertTriangle className="h-4 w-4 text-yellow-500" />}
              label="Trung bình"
              count={warning.length}
              color="text-yellow-500"
            />
            <SummaryCard
              icon={<CheckCircle className="h-4 w-4 text-green-500" />}
              label="Thấp"
              count={normal.length}
              color="text-green-500"
            />
          </div>

          {/* Detection list */}
          <div className="max-h-80 overflow-y-auto">
            {sortedDetections.map((detection) => (
              <DetectionItem
                key={detection.id}
                detection={detection}
                isHovered={hoveredDetection?.id === detection.id}
                isSelected={selectedDetection?.id === detection.id}
                isHidden={hiddenDetections.has(detection.id)}
                onHover={onDetectionHover}
                onSelect={onDetectionSelect}
                onToggleVisibility={handleToggleVisibility}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Summary card component
interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: string;
}

function SummaryCard({ icon, label, count, color }: SummaryCardProps) {
  return (
    <div className="flex items-center gap-2 p-2 bg-slate-700/50 rounded">
      {icon}
      <div>
        <div className={cn('text-sm font-medium', color)}>{count}</div>
        <div className="text-xs text-slate-400">{label}</div>
      </div>
    </div>
  );
}

// Individual detection item
interface DetectionItemProps {
  detection: Detection;
  isHovered: boolean;
  isSelected: boolean;
  isHidden: boolean;
  onHover?: (detection: Detection | null) => void;
  onSelect?: (detection: Detection | null) => void;
  onToggleVisibility: (detectionId: string) => void;
}

function DetectionItem({
  detection,
  isHovered,
  isSelected,
  isHidden,
  onHover,
  onSelect,
  onToggleVisibility,
}: DetectionItemProps) {
  const color = getBboxColor(detection.className);
  const confidencePercent = (detection.confidence * 100).toFixed(0);

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 border-b border-slate-700/50 cursor-pointer transition-colors',
        isHovered && 'bg-slate-700',
        isSelected && 'bg-blue-900/30 border-l-2 border-l-blue-500',
        isHidden && 'opacity-50'
      )}
      onMouseEnter={() => onHover?.(detection)}
      onMouseLeave={() => onHover?.(null)}
      onClick={() => onSelect?.(isSelected ? null : detection)}
    >
      {/* Color indicator */}
      <div
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />

      {/* Detection info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">
            {detection.className}
          </span>
          {detection.source && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-600 text-slate-300">
              {detection.source}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <ConfidenceBar confidence={detection.confidence} />
          <span className="text-xs text-slate-400">{confidencePercent}%</span>
        </div>
      </div>

      {/* Visibility toggle */}
      <button
        className="p-1 rounded hover:bg-slate-600 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisibility(detection.id);
        }}
      >
        {isHidden ? (
          <EyeOff className="h-4 w-4 text-slate-500" />
        ) : (
          <Eye className="h-4 w-4 text-slate-400" />
        )}
      </button>
    </div>
  );
}

// Confidence bar component
interface ConfidenceBarProps {
  confidence: number;
}

function ConfidenceBar({ confidence }: ConfidenceBarProps) {
  const getColor = () => {
    if (confidence >= 0.8) return 'bg-red-500';
    if (confidence >= 0.5) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="flex-1 h-1.5 bg-slate-600 rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all', getColor())}
        style={{ width: `${confidence * 100}%` }}
      />
    </div>
  );
}

export default DetectionPanel;
