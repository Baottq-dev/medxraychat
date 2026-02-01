'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { X, FileImage, Loader2 } from 'lucide-react';

interface StudyInfo {
  patientName: string;
  patientId: string;
  studyDate: string;
  modality: string;
  bodyPart: string;
  description: string;
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (studyInfo: StudyInfo, files: File[]) => void;
  files: File[];
  isUploading: boolean;
  onFilesChange?: (files: File[]) => void;
}

const MODALITIES = [
  { value: 'CR', label: 'CR - Computed Radiography' },
  { value: 'DX', label: 'DX - Digital Radiography' },
  { value: 'CT', label: 'CT - Computed Tomography' },
  { value: 'MR', label: 'MR - Magnetic Resonance' },
];

const BODY_PARTS = [
  { value: 'CHEST', label: 'Ngực (Chest)' },
  { value: 'ABDOMEN', label: 'Bụng (Abdomen)' },
  { value: 'SPINE', label: 'Cột sống (Spine)' },
  { value: 'PELVIS', label: 'Xương chậu (Pelvis)' },
  { value: 'EXTREMITY', label: 'Chi (Extremity)' },
  { value: 'HEAD', label: 'Đầu (Head)' },
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_EXTENSIONS = ['.dcm', '.dicom', '.png', '.jpg', '.jpeg'];

export function UploadModal({
  isOpen,
  onClose,
  onSubmit,
  files,
  isUploading,
  onFilesChange,
}: UploadModalProps) {
  const [studyInfo, setStudyInfo] = useState<StudyInfo>({
    patientName: '',
    patientId: '',
    studyDate: new Date().toISOString().split('T')[0],
    modality: 'DX',
    bodyPart: 'CHEST',
    description: '',
  });
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  // Use either passed files or local files
  const activeFiles = files.length > 0 ? files : localFiles;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of selectedFiles) {
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: Vượt quá 100MB`);
        continue;
      }
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        errors.push(`${file.name}: Định dạng không hỗ trợ`);
        continue;
      }
      validFiles.push(file);
    }

    if (errors.length > 0) {
      setFileError(errors.join('\n'));
    } else {
      setFileError(null);
    }

    if (validFiles.length > 0) {
      setLocalFiles(validFiles);
      onFilesChange?.(validFiles);
    }

    e.target.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(studyInfo, activeFiles);
  };

  const updateField = (field: keyof StudyInfo, value: string) => {
    setStudyInfo((prev) => ({ ...prev, [field]: value }));
  };

  const totalSize = activeFiles.reduce((sum, f) => sum + f.size, 0);
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isUploading && onClose()}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Thông tin Study
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Files info */}
          <div className="p-3 bg-slate-700/50 rounded-lg">
            {activeFiles.length > 0 ? (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <FileImage className="h-4 w-4 text-blue-400" />
                  <span className="text-slate-300">
                    {activeFiles.length} file{activeFiles.length > 1 ? 's' : ''} ({formatSize(totalSize)})
                  </span>
                </div>
                <div className="mt-2 max-h-20 overflow-y-auto">
                  {activeFiles.slice(0, 5).map((file, i) => (
                    <p key={i} className="text-xs text-slate-400 truncate">
                      {file.name}
                    </p>
                  ))}
                  {activeFiles.length > 5 && (
                    <p className="text-xs text-slate-500">
                      +{activeFiles.length - 5} file khác
                    </p>
                  )}
                </div>
                {/* Allow changing files */}
                <label className="mt-2 block cursor-pointer">
                  <span className="text-xs text-blue-400 hover:underline">
                    Thay đổi file
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
              </>
            ) : (
              <label className="block cursor-pointer text-center py-4">
                <div className="flex flex-col items-center gap-2">
                  <FileImage className="h-8 w-8 text-slate-500" />
                  <span className="text-sm text-slate-400">
                    Chưa có file nào
                  </span>
                  <span className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                    Chọn file
                  </span>
                  <span className="text-xs text-slate-500">
                    DICOM, PNG, JPEG (tối đa 100MB)
                  </span>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept=".dcm,.dicom,.png,.jpg,.jpeg,image/*"
                  multiple
                  onChange={handleFileSelect}
                  disabled={isUploading}
                />
              </label>
            )}
            {fileError && (
              <p className="mt-2 text-xs text-red-400">{fileError}</p>
            )}
          </div>

          {/* Patient Name */}
          <div className="space-y-1.5">
            <Label htmlFor="patientName" className="text-slate-300 text-sm">
              Tên bệnh nhân *
            </Label>
            <Input
              id="patientName"
              value={studyInfo.patientName}
              onChange={(e) => updateField('patientName', e.target.value)}
              placeholder="Nguyễn Văn A"
              className="bg-slate-700 border-slate-600 text-white"
              required
              disabled={isUploading}
            />
          </div>

          {/* Patient ID */}
          <div className="space-y-1.5">
            <Label htmlFor="patientId" className="text-slate-300 text-sm">
              Mã bệnh nhân
            </Label>
            <Input
              id="patientId"
              value={studyInfo.patientId}
              onChange={(e) => updateField('patientId', e.target.value)}
              placeholder="BN-001"
              className="bg-slate-700 border-slate-600 text-white"
              disabled={isUploading}
            />
          </div>

          {/* Study Date & Modality */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="studyDate" className="text-slate-300 text-sm">
                Ngày chụp
              </Label>
              <Input
                id="studyDate"
                type="date"
                value={studyInfo.studyDate}
                onChange={(e) => updateField('studyDate', e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                disabled={isUploading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="modality" className="text-slate-300 text-sm">
                Modality
              </Label>
              <select
                id="modality"
                value={studyInfo.modality}
                onChange={(e) => updateField('modality', e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-slate-600 bg-slate-700 text-white text-sm"
                disabled={isUploading}
              >
                {MODALITIES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.value}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Body Part */}
          <div className="space-y-1.5">
            <Label htmlFor="bodyPart" className="text-slate-300 text-sm">
              Vùng chụp
            </Label>
            <select
              id="bodyPart"
              value={studyInfo.bodyPart}
              onChange={(e) => updateField('bodyPart', e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-slate-600 bg-slate-700 text-white text-sm"
              disabled={isUploading}
            >
              {BODY_PARTS.map((bp) => (
                <option key={bp.value} value={bp.value}>
                  {bp.label}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-slate-300 text-sm">
              Ghi chú
            </Label>
            <Input
              id="description"
              value={studyInfo.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Mô tả ngắn về study..."
              className="bg-slate-700 border-slate-600 text-white"
              disabled={isUploading}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isUploading}
              className="text-slate-400 hover:text-white"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={!studyInfo.patientName || activeFiles.length === 0 || isUploading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Đang tải lên...
                </>
              ) : (
                'Tải lên'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
