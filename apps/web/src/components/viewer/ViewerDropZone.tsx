'use client';

import { useState, useCallback } from 'react';
import { Upload, ImageIcon, FileWarning, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ViewerDropZoneProps {
  onFilesDropped: (files: File[]) => void;
  isUploading?: boolean;
  uploadProgress?: number;
  className?: string;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_TYPES = [
  'application/dicom',
  'application/octet-stream',
  'image/png',
  'image/jpeg',
  'image/jpg',
];
const ALLOWED_EXTENSIONS = ['.dcm', '.dicom', '.png', '.jpg', '.jpeg'];

export function ViewerDropZone({
  onFilesDropped,
  isUploading = false,
  uploadProgress = 0,
  className,
}: ViewerDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFiles = (files: File[]): File[] => {
    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of files) {
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: Vượt quá 100MB`);
        continue;
      }

      // Check file type/extension
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      const isValidType = ALLOWED_TYPES.includes(file.type) ||
                         ALLOWED_EXTENSIONS.includes(ext);

      if (!isValidType) {
        errors.push(`${file.name}: Định dạng không hỗ trợ`);
        continue;
      }

      validFiles.push(file);
    }

    if (errors.length > 0) {
      setError(errors.join('\n'));
    } else {
      setError(null);
    }

    return validFiles;
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) {
      setIsDragging(true);
    }
  }, [isUploading]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (isUploading) return;

    const files = Array.from(e.dataTransfer.files);
    const validFiles = validateFiles(files);

    if (validFiles.length > 0) {
      onFilesDropped(validFiles);
    }
  }, [isUploading, onFilesDropped]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (isUploading) return;

    const files = Array.from(e.target.files || []);
    const validFiles = validateFiles(files);

    if (validFiles.length > 0) {
      onFilesDropped(validFiles);
    }

    // Reset input
    e.target.value = '';
  }, [isUploading, onFilesDropped]);

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center h-full w-full',
        'bg-slate-900/50',
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop zone overlay */}
      <div
        className={cn(
          'absolute inset-4 rounded-xl border-2 border-dashed transition-all duration-200',
          'flex flex-col items-center justify-center',
          isDragging
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-slate-600 hover:border-slate-500',
          isUploading && 'pointer-events-none opacity-50'
        )}
      >
        {isUploading ? (
          // Uploading state
          <div className="text-center">
            <Loader2 className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-lg font-medium text-white mb-2">
              Đang tải lên...
            </p>
            <div className="w-48 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-sm text-slate-400 mt-2">{uploadProgress}%</p>
          </div>
        ) : (
          // Ready state
          <>
            <div className={cn(
              'p-4 rounded-full mb-4 transition-colors',
              isDragging ? 'bg-blue-500/20' : 'bg-slate-700/50'
            )}>
              {isDragging ? (
                <Upload className="h-10 w-10 text-blue-400" />
              ) : (
                <ImageIcon className="h-10 w-10 text-slate-400" />
              )}
            </div>

            <p className="text-lg font-medium text-white mb-2">
              {isDragging ? 'Thả file vào đây' : 'Chưa có ảnh nào'}
            </p>

            <p className="text-sm text-slate-400 mb-4">
              Kéo thả file DICOM, PNG hoặc JPEG vào đây
            </p>

            <label className="cursor-pointer">
              <span className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                Chọn file
              </span>
              <input
                type="file"
                className="hidden"
                accept=".dcm,.dicom,.png,.jpg,.jpeg,image/*"
                multiple
                onChange={handleFileSelect}
                disabled={isUploading}
              />
            </label>

            <p className="text-xs text-slate-500 mt-4">
              Hỗ trợ: DICOM, PNG, JPEG (tối đa 100MB)
            </p>
          </>
        )}

        {/* Error message */}
        {error && (
          <div className="absolute bottom-4 left-4 right-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
            <div className="flex items-start gap-2">
              <FileWarning className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300 whitespace-pre-line">{error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
