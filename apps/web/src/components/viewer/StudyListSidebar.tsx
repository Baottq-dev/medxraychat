'use client';

import { useEffect, useState, useMemo } from 'react';
import { useStudyStore } from '@/stores';
import type { Study } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  ImageIcon,
  Calendar,
  Plus,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StudyListSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onStudySelect: (study: Study) => void;
  onUploadClick: () => void;
  selectedStudyId?: string;
}

export function StudyListSidebar({
  isCollapsed,
  onToggleCollapse,
  onStudySelect,
  onUploadClick,
  selectedStudyId,
}: StudyListSidebarProps) {
  const { studies, isLoading, fetchStudies } = useStudyStore();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchStudies(1, 50);
  }, [fetchStudies]);

  const filteredStudies = useMemo(() => {
    if (!searchQuery.trim()) return studies;
    const query = searchQuery.toLowerCase();
    return studies.filter(
      (study) =>
        study.patientName?.toLowerCase().includes(query) ||
        study.patientId?.toLowerCase().includes(query) ||
        study.description?.toLowerCase().includes(query)
    );
  }, [studies, searchQuery]);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'in_progress':
        return 'bg-yellow-500';
      case 'reviewed':
        return 'bg-blue-500';
      default:
        return 'bg-slate-500';
    }
  };

  return (
    <div
      className={cn(
        'h-full bg-slate-800 border-r border-slate-700 flex flex-col transition-all duration-300',
        isCollapsed ? 'w-12' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="p-2 border-b border-slate-700 flex items-center justify-between">
        {!isCollapsed && (
          <span className="text-sm font-medium text-slate-300 px-2">Studies</span>
        )}
        <div className="flex items-center gap-1">
          {!isCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-700"
              onClick={onUploadClick}
              title="Upload mới"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-700"
            onClick={onToggleCollapse}
            title={isCollapsed ? 'Mở rộng' : 'Thu gọn'}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Collapsed view */}
      {isCollapsed ? (
        <div className="flex-1 flex flex-col items-center py-2 gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-700"
            onClick={onUploadClick}
            title="Upload mới"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-700"
            onClick={onToggleCollapse}
            title="Xem danh sách"
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Tìm kiếm..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 bg-slate-700 border-slate-600 text-sm text-white placeholder:text-slate-500"
              />
            </div>
          </div>

          {/* Study List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              </div>
            ) : filteredStudies.length === 0 ? (
              <div className="text-center py-8 px-4">
                <FolderOpen className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500">
                  {searchQuery ? 'Không tìm thấy' : 'Chưa có study'}
                </p>
                {!searchQuery && (
                  <Button
                    variant="link"
                    size="sm"
                    className="text-blue-400 mt-1"
                    onClick={onUploadClick}
                  >
                    Upload ngay
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {filteredStudies.map((study) => (
                  <button
                    key={study.id}
                    onClick={() => onStudySelect(study)}
                    className={cn(
                      'w-full text-left p-2 rounded-lg transition-colors',
                      selectedStudyId === study.id
                        ? 'bg-blue-600/30 border border-blue-500/50'
                        : 'hover:bg-slate-700/50'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {/* Status indicator */}
                      <div
                        className={cn(
                          'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                          getStatusColor(study.status)
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {study.patientName || 'N/A'}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {study.description || study.modality}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <ImageIcon className="h-3 w-3" />
                            {study.imageCount}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(study.studyDate)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-2 border-t border-slate-700">
            <p className="text-xs text-slate-500 text-center">
              {filteredStudies.length} studies
            </p>
          </div>
        </>
      )}
    </div>
  );
}
