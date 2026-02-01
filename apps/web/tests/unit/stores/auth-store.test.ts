import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth-store';
import { act } from '@testing-library/react';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock API client
vi.mock('@/lib/api-client', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

describe('Auth Store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAuthStore.setState({
      user: null,
      tokens: null,
      isLoading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have null user initially', () => {
      const { user } = useAuthStore.getState();
      expect(user).toBeNull();
    });

    it('should have null tokens initially', () => {
      const { tokens } = useAuthStore.getState();
      expect(tokens).toBeNull();
    });

    it('should not be loading initially', () => {
      const { isLoading } = useAuthStore.getState();
      expect(isLoading).toBe(false);
    });

    it('should have no error initially', () => {
      const { error } = useAuthStore.getState();
      expect(error).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when no user', () => {
      const { isAuthenticated } = useAuthStore.getState();
      expect(isAuthenticated).toBe(false);
    });

    it('should return true when user exists', () => {
      useAuthStore.setState({
        user: {
          id: '1',
          email: 'test@example.com',
          fullName: 'Test User',
          role: 'user',
        },
        tokens: {
          accessToken: 'token',
          refreshToken: 'refresh',
          tokenType: 'Bearer',
        },
      });
      const { isAuthenticated } = useAuthStore.getState();
      expect(isAuthenticated).toBe(true);
    });
  });

  describe('logout', () => {
    it('should clear user and tokens on logout', () => {
      // Set up authenticated state
      useAuthStore.setState({
        user: {
          id: '1',
          email: 'test@example.com',
          fullName: 'Test User',
          role: 'user',
        },
        tokens: {
          accessToken: 'token',
          refreshToken: 'refresh',
          tokenType: 'Bearer',
        },
      });

      // Logout
      act(() => {
        useAuthStore.getState().logout();
      });

      const { user, tokens, isAuthenticated } = useAuthStore.getState();
      expect(user).toBeNull();
      expect(tokens).toBeNull();
      expect(isAuthenticated).toBe(false);
    });

    it('should remove tokens from localStorage on logout', () => {
      act(() => {
        useAuthStore.getState().logout();
      });

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('medxray-tokens');
    });
  });

  describe('setError', () => {
    it('should set error message', () => {
      act(() => {
        useAuthStore.setState({ error: 'Test error' });
      });

      const { error } = useAuthStore.getState();
      expect(error).toBe('Test error');
    });
  });
});
