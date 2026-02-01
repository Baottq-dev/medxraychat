import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, AuthTokens } from '@/types';
import { apiClient } from '@/lib/api-client';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  hasHydrated: boolean;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  clearError: () => void;
  setUser: (user: User) => void;
  setHasHydrated: (state: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      hasHydrated: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiClient.post<{
            user: {
              id: string;
              email: string;
              fullName: string | null;
              role: string;
              isActive: boolean;
              createdAt: string;
            };
            accessToken: string;
            refreshToken?: string;
            tokenType: string;
          }>('/auth/login', { email, password });

          const tokens: AuthTokens = {
            accessToken: response.accessToken,
            refreshToken: response.refreshToken || '',
            tokenType: response.tokenType,
          };

          const user: User = {
            id: response.user.id,
            email: response.user.email,
            fullName: response.user.fullName || '',
            role: response.user.role as User['role'],
            createdAt: response.user.createdAt,
            updatedAt: response.user.createdAt,
          };

          set({
            user,
            tokens,
            isAuthenticated: true,
            isLoading: false,
          });

          // Set token in API client
          apiClient.setAuthToken(tokens.accessToken);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      register: async (email: string, password: string, fullName: string) => {
        set({ isLoading: true, error: null });
        try {
          // Register returns user data, then we need to login to get tokens
          await apiClient.post<{
            id: string;
            email: string;
            fullName: string | null;
            role: string;
            isActive: boolean;
            createdAt: string;
          }>('/auth/register', { email, password, full_name: fullName });

          // Now login to get tokens
          const loginResponse = await apiClient.post<{
            user: {
              id: string;
              email: string;
              fullName: string | null;
              role: string;
              isActive: boolean;
              createdAt: string;
            };
            accessToken: string;
            refreshToken?: string;
            tokenType: string;
          }>('/auth/login', { email, password });

          const tokens: AuthTokens = {
            accessToken: loginResponse.accessToken,
            refreshToken: loginResponse.refreshToken || '',
            tokenType: loginResponse.tokenType,
          };

          const user: User = {
            id: loginResponse.user.id,
            email: loginResponse.user.email,
            fullName: loginResponse.user.fullName || '',
            role: loginResponse.user.role as User['role'],
            createdAt: loginResponse.user.createdAt,
            updatedAt: loginResponse.user.createdAt,
          };

          set({
            user,
            tokens,
            isAuthenticated: true,
            isLoading: false,
          });

          apiClient.setAuthToken(tokens.accessToken);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Registration failed',
            isLoading: false,
          });
          throw error;
        }
      },

      logout: () => {
        apiClient.clearAuthToken();
        set({
          user: null,
          tokens: null,
          isAuthenticated: false,
          error: null,
        });
      },

      refreshToken: async () => {
        const { tokens } = get();
        if (!tokens?.refreshToken) {
          throw new Error('No refresh token available');
        }

        try {
          const response = await apiClient.post<{
            accessToken: string;
            refreshToken: string;
            tokenType: string;
          }>('/auth/refresh', { refresh_token: tokens.refreshToken });

          const newTokens: AuthTokens = {
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            tokenType: response.tokenType,
          };

          set({ tokens: newTokens });
          apiClient.setAuthToken(newTokens.accessToken);
        } catch (error) {
          // If refresh fails, logout
          get().logout();
          throw error;
        }
      },

      clearError: () => set({ error: null }),

      setUser: (user: User) => set({ user }),

      setHasHydrated: (state: boolean) => set({ hasHydrated: state }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
