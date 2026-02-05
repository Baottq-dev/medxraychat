/**
 * Dashboard API functions
 */

import { apiClient } from '../api-client';
import type { DashboardStats } from '@/types';

export const dashboardApi = {
  /**
   * Get dashboard statistics for the current user
   */
  getStats: async (): Promise<DashboardStats> => {
    const response = await apiClient.get<{
      total_studies: number;
      analyses_today: number;
      chat_sessions: number;
      reports: number;
    }>('/dashboard/stats');

    // Transform snake_case to camelCase
    return {
      totalStudies: response.total_studies,
      analysesToday: response.analyses_today,
      chatSessions: response.chat_sessions,
      reports: response.reports,
    };
  },
};

export default dashboardApi;
