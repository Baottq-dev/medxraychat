/**
 * Auth API functions
 */

import { apiClient } from '../api-client';
import { User, AuthTokens, LoginCredentials, RegisterData } from '@/types';

interface LoginResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  user: {
    id: string;
    email: string;
    full_name?: string;
    role: string;
    is_active: boolean;
    created_at: string;
  };
}

interface UserResponse {
  id: string;
  email: string;
  full_name?: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export const authApi = {
  /**
   * Login with email and password
   */
  login: async (credentials: LoginCredentials): Promise<AuthTokens> => {
    const formData = new FormData();
    formData.append('username', credentials.email);
    formData.append('password', credentials.password);

    const response = await apiClient.post<LoginResponse>('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token || '',
      tokenType: response.token_type,
    };
  },

  /**
   * Register a new user
   */
  register: async (data: RegisterData): Promise<User> => {
    const response = await apiClient.post<UserResponse>('/auth/register', {
      email: data.email,
      password: data.password,
      full_name: data.fullName,
      role: data.role,
    });
    return {
      id: response.id,
      email: response.email,
      fullName: response.full_name || '',
      role: response.role as User['role'],
      createdAt: response.created_at,
      updatedAt: response.created_at,
    };
  },

  /**
   * Get current user info
   */
  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get<UserResponse>('/auth/me');
    return {
      id: response.id,
      email: response.email,
      fullName: response.full_name || '',
      role: response.role as User['role'],
      createdAt: response.created_at,
      updatedAt: response.created_at,
    };
  },

  /**
   * Refresh access token
   */
  refreshToken: async (refreshToken: string): Promise<AuthTokens> => {
    const response = await apiClient.post<LoginResponse>('/auth/refresh', {
      refresh_token: refreshToken,
    });
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token || '',
      tokenType: response.token_type,
    };
  },

  /**
   * Logout
   */
  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  /**
   * Request password reset
   */
  requestPasswordReset: async (email: string): Promise<void> => {
    await apiClient.post('/auth/password-reset/request', { email });
  },

  /**
   * Reset password
   */
  resetPassword: async (token: string, newPassword: string): Promise<void> => {
    await apiClient.post('/auth/password-reset/confirm', {
      token,
      new_password: newPassword,
    });
  },

  /**
   * Change password
   */
  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await apiClient.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },

  /**
   * Update user profile
   */
  updateProfile: async (data: Partial<User>): Promise<User> => {
    const response = await apiClient.patch<UserResponse>('/auth/me', data);
    return {
      id: response.id,
      email: response.email,
      fullName: response.full_name || '',
      role: response.role as User['role'],
      createdAt: response.created_at,
      updatedAt: response.created_at,
    };
  },
};

export default authApi;
