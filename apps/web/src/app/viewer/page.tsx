'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore, useStudyStore, useViewerStore, useChatStore } from '@/stores';
import { DicomViewer, ViewerToolbar, AnnotationOverlay, MeasurementOverlay, DetectionOverlay, HeatmapOverlay } from '@/components/viewer';
import { AnnotationToolbar } from '@/components/viewer/AnnotationToolbar';
import { MeasurementToolbar } from '@/components/viewer/MeasurementToolbar';
import { StudyListSidebar } from '@/components/viewer/StudyListSidebar';
import { ViewerDropZone } from '@/components/viewer/ViewerDropZone';
import { UploadModal } from '@/components/viewer/UploadModal';
import { AIAnalysisPanel } from '@/components/viewer/AIAnalysisPanel';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import type { Study } from '@/types';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Download,
  Share2,
  Maximize2,
  Loader2,
  PanelLeftClose,
  PanelLeft,
  PanelRightClose,
  PanelRight,
} from 'lucide-react';
import Link from 'next/link';

function ViewerPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, hasHydrated } = useAuthStore();
  const {
    currentStudy,
    currentImage,
    images,
    setCurrentImage,
    setCurrentStudy,
    isLoadingImages,
    fetchStudyById,
    fetchStudyImages,
    uploadStudy,
  } = useStudyStore();

  const setCurrentImageId = useViewerStore((state) => state.setCurrentImageId);

  // UI state
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Redirect if not authenticated (only after hydration)
  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      router.push('/login');
    }
  }, [hasHydrated, isAuthenticated, router]);

  // Load study from URL param
  useEffect(() => {
    const studyId = searchParams.get('study');
    if (studyId && isAuthenticated) {
      fetchStudyById(studyId).then(() => {
        fetchStudyImages(studyId);
      }).catch(console.error);
    }
  }, [searchParams, isAuthenticated, fetchStudyById, fetchStudyImages]);

  // Sync currentImageId in viewer store when image changes (only on actual image change)
  const prevImageIdRef = useRef<string | null>(null);
  useEffect(() => {
    const newImageId = currentImage?.id || null;
    if (newImageId !== prevImageIdRef.current) {
      prevImageIdRef.current = newImageId;
      setCurrentImageId(newImageId);
    }
  }, [currentImage?.id, setCurrentImageId]);

  // Navigate between images
  const currentIndex = currentImage ? images.findIndex((img) => img.id === currentImage.id) : -1;

  const handlePrevImage = () => {
    if (currentIndex > 0) {
      setCurrentImage(images[currentIndex - 1]);
      // Clear analysis when switching images
      useChatStore.getState().setCurrentAnalysis(null);
    }
  };

  const handleNextImage = () => {
    if (currentIndex < images.length - 1) {
      setCurrentImage(images[currentIndex + 1]);
      // Clear analysis when switching images
      useChatStore.getState().setCurrentAnalysis(null);
    }
  };

  // Handle study selection from sidebar
  const { setCurrentSession, setCurrentAnalysis } = useChatStore();
  
  const handleStudySelect = async (study: Study) => {
    setCurrentStudy(study);
    // Reset chat session and analysis when switching studies
    setCurrentSession(null);
    setCurrentAnalysis(null);
    await fetchStudyImages(study.id);
    // Update URL
    router.push(`/viewer?study=${study.id}`, { scroll: false });
  };

  // Handle files dropped on viewer
  const handleFilesDropped = useCallback((files: File[]) => {
    setPendingFiles(files);
    setShowUploadModal(true);
  }, []);

  // Handle upload submit
  const handleUploadSubmit = async (studyInfo: {
    patientName: string;
    patientId: string;
    studyDate: string;
    modality: string;
    bodyPart: string;
    description: string;
  }, files: File[]) => {
    // Use files from modal if provided, otherwise use pendingFiles
    const filesToUpload = files.length > 0 ? files : pendingFiles;

    if (filesToUpload.length === 0) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng chọn ít nhất 1 file để tải lên.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const study = await uploadStudy(filesToUpload, {
        patientName: studyInfo.patientName,
        patientId: studyInfo.patientId,
        studyDate: studyInfo.studyDate,
        modality: studyInfo.modality,
        description: studyInfo.description,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Auto-select the new study
      await fetchStudyImages(study.id);
      router.push(`/viewer?study=${study.id}`, { scroll: false });

      toast({
        title: 'Tải lên thành công',
        description: `Study "${studyInfo.patientName}" đã được tạo`,
      });

      setShowUploadModal(false);
      setPendingFiles([]);
    } catch (error) {
      toast({
        title: 'Lỗi tải lên',
        description: 'Không thể tải lên study. Vui lòng thử lại.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Show loading while hydrating or not authenticated
  if (!hasHydrated || !isAuthenticated) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  const hasImage = !!currentImage;

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-blue-500" />
            <span className="font-bold text-white">MedXrayChat</span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1 ml-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                Dashboard
              </Button>
            </Link>
            <Link href="/studies">
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                Studies
              </Button>
            </Link>
            <Link href="/reports">
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                Reports
              </Button>
            </Link>
          </nav>

          {currentStudy && (
            <div className="text-sm ml-4 border-l border-slate-700 pl-4">
              <span className="text-slate-400">Study: </span>
              <span className="text-white">{currentStudy.patientName}</span>
              <span className="text-slate-500 ml-2">
                ({currentStudy.modality})
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle left sidebar */}
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:text-white"
            onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
            title={leftSidebarCollapsed ? 'Hiện sidebar' : 'Ẩn sidebar'}
          >
            {leftSidebarCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>

          <div className="w-px h-4 bg-slate-700" />

          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
            <Share2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
            <Maximize2 className="h-4 w-4" />
          </Button>

          <div className="w-px h-4 bg-slate-700" />

          {/* Toggle right panel */}
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:text-white"
            onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
            title={rightPanelCollapsed ? 'Hiện AI Panel' : 'Ẩn AI Panel'}
          >
            {rightPanelCollapsed ? (
              <PanelRight className="h-4 w-4" />
            ) : (
              <PanelRightClose className="h-4 w-4" />
            )}
          </Button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Study List */}
        <StudyListSidebar
          isCollapsed={leftSidebarCollapsed}
          onToggleCollapse={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
          onStudySelect={handleStudySelect}
          onUploadClick={() => setShowUploadModal(true)}
          selectedStudyId={currentStudy?.id}
        />

        {/* Annotation toolbar */}
        <AnnotationToolbar disabled={!hasImage} />

        {/* Measurement toolbar */}
        <MeasurementToolbar disabled={!hasImage} />

        {/* Main viewer area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Viewer toolbar - always visible, disabled when no image */}
          <ViewerToolbar disabled={!hasImage} />

          {/* Viewer */}
          <div className="flex-1 relative">
            {hasImage ? (
              <>
                <DicomViewer
                  image={currentImage}
                  className="absolute inset-0"
                  onError={(error) => console.error('Image load error:', error)}
                />

                {/* Overlays */}
                <AnnotationOverlay
                  className="absolute inset-0"
                  pixelSpacing={currentImage?.pixelSpacing}
                />
                <MeasurementOverlay
                  className="absolute inset-0"
                  pixelSpacing={currentImage?.pixelSpacing}
                />
                <HeatmapOverlay className="absolute inset-0" />
                <DetectionOverlay className="absolute inset-0" />

                {/* Image navigation */}
                {images.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/70 rounded-lg px-4 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-white"
                      onClick={handlePrevImage}
                      disabled={currentIndex <= 0}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <span className="text-white text-sm">
                      {currentIndex + 1} / {images.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-white"
                      onClick={handleNextImage}
                      disabled={currentIndex >= images.length - 1}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </div>
                )}
              </>
            ) : (
              // Drop zone when no image
              <ViewerDropZone
                onFilesDropped={handleFilesDropped}
                isUploading={isUploading}
                uploadProgress={uploadProgress}
              />
            )}

            {/* Loading overlay */}
            {isLoadingImages && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          {images.length > 1 && (
            <div className="h-20 bg-slate-800 border-t border-slate-700 p-2 overflow-x-auto">
              <div className="flex gap-2 h-full">
                {images.map((image, index) => (
                  <button
                    key={image.id}
                    className={`h-full aspect-square rounded border-2 transition-colors ${currentImage?.id === image.id
                        ? 'border-blue-500'
                        : 'border-transparent hover:border-slate-500'
                      }`}
                    onClick={() => setCurrentImage(image)}
                  >
                    <div className="w-full h-full bg-slate-700 rounded flex items-center justify-center text-xs text-slate-400">
                      {index + 1}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right panel - AI Analysis */}
        {!rightPanelCollapsed && (
          <AIAnalysisPanel
            currentImage={currentImage}
            studyId={currentStudy?.id || null}
            className="w-80"
          />
        )}
      </div>

      {/* Upload Modal */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => {
          if (!isUploading) {
            setShowUploadModal(false);
            setPendingFiles([]);
          }
        }}
        onSubmit={handleUploadSubmit}
        files={pendingFiles}
        isUploading={isUploading}
        onFilesChange={(files) => setPendingFiles(files)}
      />
    </div>
  );
}

export default function ViewerPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    }>
      <ViewerPageContent />
    </Suspense>
  );
}
