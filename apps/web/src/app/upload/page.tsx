'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Upload, 
  X, 
  FileImage, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  FolderUp,
  Info,
  ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuthStore, useStudyStore } from '@/stores';
import { useToast } from '@/hooks/use-toast';

interface UploadFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

export default function UploadPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { uploadImage } = useStudyStore();
  const { toast } = useToast();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Form data for new study
  const [studyInfo, setStudyInfo] = useState({
    patient_name: '',
    patient_id: '',
    description: '',
    study_date: new Date().toISOString().split('T')[0],
    modality: 'CR', // Computed Radiography (X-ray)
    body_part: 'CHEST'
  });

  // Redirect if not authenticated
  if (typeof window !== 'undefined' && !isAuthenticated) {
    router.push('/login');
    return null;
  }

  const validateFile = (file: File): string | null => {
    const maxSize = 100 * 1024 * 1024; // 100MB
    const allowedTypes = [
      'application/dicom',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'application/octet-stream' // DICOM files often have this type
    ];
    const allowedExtensions = ['.dcm', '.dicom', '.png', '.jpg', '.jpeg'];
    
    if (file.size > maxSize) {
      return 'File quá lớn (tối đa 100MB)';
    }
    
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedExtensions.includes(ext) && !allowedTypes.includes(file.type)) {
      return 'Định dạng file không được hỗ trợ';
    }
    
    return null;
  };

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const uploadFiles: UploadFile[] = fileArray.map(file => {
      const error = validateFile(file);
      return {
        id: Math.random().toString(36).substr(2, 9),
        file,
        name: file.name,
        size: file.size,
        status: error ? 'error' : 'pending',
        progress: 0,
        error: error ?? undefined
      };
    });
    
    setFiles(prev => [...prev, ...uploadFiles]);
  }, []);

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
    }
  };

  const uploadFiles = async () => {
    if (files.length === 0) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng chọn ít nhất một file',
        variant: 'destructive'
      });
      return;
    }

    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) {
      toast({
        title: 'Lỗi',
        description: 'Không có file nào để tải lên',
        variant: 'destructive'
      });
      return;
    }

    setIsUploading(true);

    for (const uploadFile of pendingFiles) {
      // Update status to uploading
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? { ...f, status: 'uploading' as const, progress: 0 } : f
      ));

      try {
        // Simulate progress updates
        const progressInterval = setInterval(() => {
          setFiles(prev => prev.map(f => 
            f.id === uploadFile.id && f.progress < 90
              ? { ...f, progress: f.progress + 10 }
              : f
          ));
        }, 200);

        // Upload file
        await uploadImage(uploadFile.file, {
          ...studyInfo,
          filename: uploadFile.name
        });

        clearInterval(progressInterval);

        // Update status to success
        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id ? { ...f, status: 'success' as const, progress: 100 } : f
        ));

      } catch (error) {
        // Update status to error
        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { ...f, status: 'error' as const, error: 'Lỗi khi tải lên' } 
            : f
        ));
      }
    }

    setIsUploading(false);

    const successCount = files.filter(f => f.status === 'success').length + 
                         pendingFiles.filter(f => !files.find(ff => ff.id === f.id && ff.status === 'error')).length;
    
    if (successCount > 0) {
      toast({
        title: 'Thành công',
        description: `Đã tải lên ${successCount} file`
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getStatusIcon = (status: UploadFile['status']) => {
    switch (status) {
      case 'uploading':
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <FileImage className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const successCount = files.filter(f => f.status === 'success').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Tải lên ảnh X-quang</h1>
              <p className="text-sm text-muted-foreground">
                Hỗ trợ DICOM, PNG, JPEG (tối đa 100MB/file)
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Drop Zone */}
            <Card>
              <CardContent className="p-6">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`
                    border-2 border-dashed rounded-lg p-12 text-center transition-colors
                    ${isDragging 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border hover:border-primary/50'
                    }
                  `}
                >
                  <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">
                    Kéo thả file vào đây
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    hoặc
                  </p>
                  <div className="flex justify-center gap-4">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".dcm,.dicom,.png,.jpg,.jpeg"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <Button onClick={() => fileInputRef.current?.click()}>
                      <FileImage className="w-4 h-4 mr-2" />
                      Chọn file
                    </Button>
                    
                    <input
                      ref={folderInputRef}
                      type="file"
                      multiple
                      accept=".dcm,.dicom,.png,.jpg,.jpeg"
                      onChange={handleFileSelect}
                      className="hidden"
                      {...({ webkitdirectory: '', directory: '' } as any)}
                    />
                    <Button variant="outline" onClick={() => folderInputRef.current?.click()}>
                      <FolderUp className="w-4 h-4 mr-2" />
                      Chọn thư mục
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* File List */}
            {files.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      Danh sách file ({files.length})
                    </CardTitle>
                    <div className="flex gap-4 text-sm">
                      {pendingCount > 0 && (
                        <span className="text-muted-foreground">{pendingCount} chờ</span>
                      )}
                      {successCount > 0 && (
                        <span className="text-green-500">{successCount} thành công</span>
                      )}
                      {errorCount > 0 && (
                        <span className="text-red-500">{errorCount} lỗi</span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {files.map(file => (
                      <div 
                        key={file.id}
                        className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg"
                      >
                        {getStatusIcon(file.status)}
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-medium truncate">{file.name}</span>
                            <span className="text-sm text-muted-foreground ml-2">
                              {formatFileSize(file.size)}
                            </span>
                          </div>
                          
                          {file.status === 'uploading' && (
                            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary transition-all duration-200"
                                style={{ width: `${file.progress}%` }}
                              />
                            </div>
                          )}
                          
                          {file.error && (
                            <p className="text-sm text-red-500 mt-1">{file.error}</p>
                          )}
                        </div>
                        
                        {file.status !== 'uploading' && (
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => removeFile(file.id)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex justify-end gap-4 mt-4 pt-4 border-t border-border">
                    <Button 
                      variant="outline" 
                      onClick={() => setFiles([])}
                      disabled={isUploading}
                    >
                      Xóa tất cả
                    </Button>
                    <Button 
                      onClick={uploadFiles}
                      disabled={isUploading || pendingCount === 0}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Đang tải lên...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Tải lên {pendingCount} file
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Study Information */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Thông tin nghiên cứu</CardTitle>
                <CardDescription>
                  Nhập thông tin bệnh nhân và nghiên cứu
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="patient_name">Tên bệnh nhân</Label>
                  <Input
                    id="patient_name"
                    placeholder="Nguyễn Văn A"
                    value={studyInfo.patient_name}
                    onChange={(e) => setStudyInfo(prev => ({ ...prev, patient_name: e.target.value }))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="patient_id">Mã bệnh nhân</Label>
                  <Input
                    id="patient_id"
                    placeholder="BN001"
                    value={studyInfo.patient_id}
                    onChange={(e) => setStudyInfo(prev => ({ ...prev, patient_id: e.target.value }))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="study_date">Ngày chụp</Label>
                  <Input
                    id="study_date"
                    type="date"
                    value={studyInfo.study_date}
                    onChange={(e) => setStudyInfo(prev => ({ ...prev, study_date: e.target.value }))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="modality">Phương thức</Label>
                  <select
                    id="modality"
                    value={studyInfo.modality}
                    onChange={(e) => setStudyInfo(prev => ({ ...prev, modality: e.target.value }))}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  >
                    <option value="CR">CR - X-quang kỹ thuật số</option>
                    <option value="DX">DX - X-quang số trực tiếp</option>
                    <option value="CT">CT - Chụp cắt lớp</option>
                    <option value="MR">MR - Cộng hưởng từ</option>
                  </select>
                </div>
                
                <div>
                  <Label htmlFor="body_part">Vị trí chụp</Label>
                  <select
                    id="body_part"
                    value={studyInfo.body_part}
                    onChange={(e) => setStudyInfo(prev => ({ ...prev, body_part: e.target.value }))}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  >
                    <option value="CHEST">Ngực</option>
                    <option value="ABDOMEN">Bụng</option>
                    <option value="SPINE">Cột sống</option>
                    <option value="PELVIS">Xương chậu</option>
                    <option value="EXTREMITY">Chi</option>
                    <option value="HEAD">Đầu</option>
                  </select>
                </div>
                
                <div>
                  <Label htmlFor="description">Mô tả</Label>
                  <textarea
                    id="description"
                    placeholder="Ghi chú về nghiên cứu..."
                    value={studyInfo.description}
                    onChange={(e) => setStudyInfo(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full h-20 px-3 py-2 rounded-md border border-input bg-background resize-none"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Tips */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-4">
                <div className="flex gap-3">
                  <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="text-sm space-y-2">
                    <p className="font-medium text-primary">Lưu ý khi tải lên</p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1">
                      <li>Định dạng DICOM được khuyến nghị</li>
                      <li>File PNG/JPEG cần độ phân giải cao</li>
                      <li>Ẩn danh hóa thông tin bệnh nhân nếu cần</li>
                      <li>AI sẽ tự động phân tích sau khi tải lên</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
