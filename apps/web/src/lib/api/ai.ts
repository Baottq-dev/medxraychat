/**
 * AI Analysis API functions
 */

import { apiClient } from '../api-client';
import { Detection, AIAnalysisResult } from '@/types';

export interface AnalyzeOptions {
  runYolo?: boolean;
  runQwen?: boolean;
  confidenceThreshold?: number;
  iouThreshold?: number;
}

export interface AnalyzeImageRequest {
  imageId: string;
  options?: AnalyzeOptions;
}

export interface AnalyzeResponse {
  requestId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: AIAnalysisResult;
  error?: string;
}

export interface QwenChatRequest {
  imageId: string;
  message: string;
  context?: string[];
}

export interface QwenChatResponse {
  response: string;
  detections?: Detection[];
  processingTime: number;
}

export const aiApi = {
  /**
   * Analyze an X-ray image with YOLO and/or Qwen
   */
  analyzeImage: async (request: AnalyzeImageRequest): Promise<AnalyzeResponse> => {
    return apiClient.post<AnalyzeResponse>('/ai/analyze', {
      image_id: request.imageId,
      run_yolo: request.options?.runYolo ?? true,
      run_qwen: request.options?.runQwen ?? true,
      confidence_threshold: request.options?.confidenceThreshold ?? 0.25,
      iou_threshold: request.options?.iouThreshold ?? 0.45,
    });
  },

  /**
   * Get analysis results for an image
   */
  getAnalysisResults: async (imageId: string): Promise<AIAnalysisResult | null> => {
    try {
      return await apiClient.get<AIAnalysisResult>(`/ai/results/${imageId}`);
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  /**
   * Get detection results for an image
   */
  getDetections: async (imageId: string): Promise<Detection[]> => {
    return apiClient.get<Detection[]>(`/ai/detections/${imageId}`);
  },

  /**
   * Chat with Qwen about an image
   */
  chatWithQwen: async (request: QwenChatRequest): Promise<QwenChatResponse> => {
    return apiClient.post<QwenChatResponse>('/ai/qwen/chat', {
      image_id: request.imageId,
      message: request.message,
      context: request.context,
    });
  },

  /**
   * Run YOLO detection only
   */
  runYoloDetection: async (
    imageId: string,
    confidenceThreshold = 0.25
  ): Promise<Detection[]> => {
    const response = await apiClient.post<{ detections: Detection[] }>('/ai/yolo/detect', {
      image_id: imageId,
      confidence_threshold: confidenceThreshold,
    });
    return response.detections;
  },

  /**
   * Get available AI models
   */
  getModels: async (): Promise<{ yolo: string; qwen: string }> => {
    return apiClient.get<{ yolo: string; qwen: string }>('/ai/models');
  },

  /**
   * Generate a report from AI analysis
   */
  generateReport: async (imageId: string): Promise<{ report: string; findings: string[] }> => {
    return apiClient.post<{ report: string; findings: string[] }>(`/ai/report/${imageId}`);
  },

  /**
   * Get analysis status (for async processing)
   */
  getAnalysisStatus: async (requestId: string): Promise<AnalyzeResponse> => {
    return apiClient.get<AnalyzeResponse>(`/ai/status/${requestId}`);
  },
};

export default aiApi;
