/**
 * Studies API functions
 */

import { apiClient } from '../api-client';
import { Study, DicomImage, PaginatedResponse } from '@/types';

export interface CreateStudyData {
  patientName: string;
  patientId: string;
  studyDate?: string;
  modality?: string;
  description?: string;
}

export interface StudyFilters {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  modality?: string;
}

interface StudyApiResponse {
  id: string;
  patient_id?: string;
  patient_name?: string;
  patient_age?: number;
  patient_sex?: string;
  study_date?: string;
  modality: string;
  description?: string;
  image_count: number;
  created_at: string;
  updated_at?: string;
}

interface PaginatedStudyResponse {
  items: StudyApiResponse[];
  total: number;
  page: number;
  size: number;
}

const transformStudy = (s: StudyApiResponse): Study => ({
  id: s.id,
  patientId: s.patient_id || '',
  patientName: s.patient_name || '',
  studyDate: s.study_date || s.created_at,
  modality: s.modality,
  description: s.description,
  status: 'pending',
  imageCount: s.image_count,
  createdAt: s.created_at,
  updatedAt: s.updated_at || s.created_at,
});

export const studiesApi = {
  /**
   * Get paginated list of studies
   */
  getStudies: async (
    page = 1,
    pageSize = 20,
    filters?: StudyFilters
  ): Promise<PaginatedResponse<Study>> => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });

    if (filters?.search) params.append('search', filters.search);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.dateFrom) params.append('date_from', filters.dateFrom);
    if (filters?.dateTo) params.append('date_to', filters.dateTo);
    if (filters?.modality) params.append('modality', filters.modality);

    const response = await apiClient.get<PaginatedStudyResponse>(`/studies?${params.toString()}`);
    return {
      items: response.items.map(transformStudy),
      total: response.total,
      page: response.page,
      pageSize: response.size,
      totalPages: Math.ceil(response.total / response.size),
    };
  },

  /**
   * Get a single study by ID
   */
  getStudy: async (studyId: string): Promise<Study> => {
    const response = await apiClient.get<StudyApiResponse>(`/studies/${studyId}`);
    return transformStudy(response);
  },

  /**
   * Create a new study
   */
  createStudy: async (data: CreateStudyData): Promise<Study> => {
    const response = await apiClient.post<StudyApiResponse>('/studies', {
      patient_name: data.patientName,
      patient_id: data.patientId,
      study_date: data.studyDate || new Date().toISOString().split('T')[0],
      modality: data.modality || 'CR',
      description: data.description,
    });
    return transformStudy(response);
  },

  /**
   * Update a study
   */
  updateStudy: async (studyId: string, data: Partial<CreateStudyData>): Promise<Study> => {
    const response = await apiClient.patch<StudyApiResponse>(`/studies/${studyId}`, data);
    return transformStudy(response);
  },

  /**
   * Delete a study
   */
  deleteStudy: async (studyId: string): Promise<void> => {
    await apiClient.delete(`/studies/${studyId}`);
  },

  /**
   * Get images for a study
   */
  getStudyImages: async (studyId: string): Promise<DicomImage[]> => {
    return apiClient.get<DicomImage[]>(`/studies/${studyId}/images`);
  },

  /**
   * Upload an image to a study
   */
  uploadImage: async (
    studyId: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<DicomImage> => {
    const formData = new FormData();
    formData.append('file', file);

    return apiClient.upload<DicomImage>(`/studies/${studyId}/images`, formData, onProgress);
  },

  /**
   * Delete an image
   */
  deleteImage: async (studyId: string, imageId: string): Promise<void> => {
    await apiClient.delete(`/studies/${studyId}/images/${imageId}`);
  },

  /**
   * Get a single image
   */
  getImage: async (imageId: string): Promise<DicomImage> => {
    return apiClient.get<DicomImage>(`/images/${imageId}`);
  },
};

export default studiesApi;
