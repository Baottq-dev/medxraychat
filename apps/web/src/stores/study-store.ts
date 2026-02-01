import { create } from 'zustand';
import type { Study, DicomImage, PaginatedResponse } from '@/types';
import { apiClient, API_BASE_URL } from '@/lib/api-client';
interface StudyState {
  // Data
  studies: Study[];
  currentStudy: Study | null;
  images: DicomImage[];
  currentImage: DicomImage | null;

  // Pagination
  totalStudies: number;
  currentPage: number;
  pageSize: number;

  // Loading states
  isLoading: boolean;
  isLoadingImages: boolean;
  error: string | null;

  // Actions
  fetchStudies: (page?: number, pageSize?: number) => Promise<void>;
  fetchStudyById: (id: string) => Promise<Study>;
  fetchStudyImages: (studyId: string) => Promise<void>;
  setCurrentStudy: (study: Study | null) => void;
  setCurrentImage: (image: DicomImage | null) => void;
  uploadStudy: (files: File[], patientInfo: Partial<Study>) => Promise<Study>;
  uploadImage: (file: File, studyInfo: { patient_name?: string; patient_id?: string; description?: string; study_date?: string; modality?: string; filename?: string }) => Promise<void>;
  deleteStudy: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useStudyStore = create<StudyState>((set, get) => ({
  studies: [],
  currentStudy: null,
  images: [],
  currentImage: null,
  totalStudies: 0,
  currentPage: 1,
  pageSize: 20,
  isLoading: false,
  isLoadingImages: false,
  error: null,

  fetchStudies: async (page = 1, pageSize = 20) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.get<PaginatedResponse<Study>>(
        `/studies?page=${page}&page_size=${pageSize}`
      );

      set({
        studies: response.items,
        totalStudies: response.total,
        currentPage: response.page,
        pageSize: response.pageSize,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch studies',
        isLoading: false,
      });
    }
  },

  fetchStudyById: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const study = await apiClient.get<Study>(`/studies/${id}`);
      set({ currentStudy: study, isLoading: false });
      return study;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch study',
        isLoading: false,
      });
      throw error;
    }
  },

  fetchStudyImages: async (studyId: string) => {
    set({ isLoadingImages: true, error: null });
    try {
      // API returns different field names, need to map
      interface ApiImageResponse {
        id: string;
        study_id: string;
        file_path: string;
        original_filename: string | null;
        width: number | null;
        height: number | null;
        created_at: string;
      }

      const apiImages = await apiClient.get<ApiImageResponse[]>(`/studies/${studyId}/images`);

      // Map API response to DicomImage type
      const images: DicomImage[] = apiImages.map((img) => ({
        id: img.id,
        studyId: img.study_id,
        filename: img.original_filename || 'unknown.dcm',
        sopInstanceUid: img.id, // Use id as placeholder
        seriesInstanceUid: studyId,
        imageNumber: 1,
        rows: img.height || 512,
        columns: img.width || 512,
        bitsAllocated: 16,
        bitsStored: 12,
        photometricInterpretation: 'MONOCHROME2',
        // Construct image URL using exported constant
        imageUrl: `${API_BASE_URL}/studies/images/${img.id}/file`,
        createdAt: img.created_at,
      }));

      set({
        images,
        currentImage: images.length > 0 ? images[0] : null,
        isLoadingImages: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch images',
        isLoadingImages: false,
      });
    }
  },

  setCurrentStudy: (study) => set({ currentStudy: study }),

  setCurrentImage: (image) => set({ currentImage: image }),

  uploadStudy: async (files: File[], patientInfo: Partial<Study>) => {
    set({ isLoading: true, error: null });
    try {
      // Step 1: Create study first
      const studyData = {
        patient_id: patientInfo.patientId,
        patient_name: patientInfo.patientName,
        study_date: patientInfo.studyDate,
        modality: patientInfo.modality || 'CR',
        description: patientInfo.description,
      };

      const study = await apiClient.post<Study>('/studies', studyData);

      // Step 2: Upload each file to the study
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        await apiClient.upload(`/studies/${study.id}/images`, formData);
      }

      // Update image count
      const updatedStudy = { ...study, imageCount: files.length };

      // Add to list
      const { studies } = get();
      set({
        studies: [updatedStudy, ...studies],
        currentStudy: updatedStudy,
        isLoading: false,
      });

      return updatedStudy;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to upload study',
        isLoading: false,
      });
      throw error;
    }
  },

  uploadImage: async (file: File, studyInfo: { patient_name?: string; patient_id?: string; description?: string; study_date?: string; modality?: string; filename?: string }) => {
    try {
      // Create study data with snake_case for API
      const studyData = {
        patient_id: studyInfo.patient_id,
        patient_name: studyInfo.patient_name,
        study_date: studyInfo.study_date,
        modality: studyInfo.modality || 'CR',
        description: studyInfo.description,
      };

      // Create study first
      const study = await apiClient.post<Study>('/studies', studyData);

      // Upload the image
      const formData = new FormData();
      formData.append('file', file);
      await apiClient.upload(`/studies/${study.id}/images`, formData);

      // Add to studies list
      const { studies } = get();
      set({
        studies: [{ ...study, imageCount: 1 }, ...studies],
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to upload image',
      });
      throw error;
    }
  },

  deleteStudy: async (id: string) => {
    try {
      await apiClient.delete(`/studies/${id}`);
      const { studies, currentStudy } = get();
      set({
        studies: studies.filter((s) => s.id !== id),
        currentStudy: currentStudy?.id === id ? null : currentStudy,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete study',
      });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
