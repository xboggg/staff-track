import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../lib/api';

interface User {
  id: string;
  employeeId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  departmentId: string;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;

  login: (email: string, password: string) => Promise<{ requiresTwoFactor?: boolean; mustChangePassword?: boolean; tempToken?: string }>;
  verify2FA: (tempToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: async (email, password) => {
        const res = await api.post('/auth/login', { email, password });
        const data = res.data;

        if (data.requiresTwoFactor) {
          return { requiresTwoFactor: true, tempToken: data.tempToken };
        }

        if (data.mustChangePassword) {
          return { mustChangePassword: true, tempToken: data.tempToken };
        }

        set({
          user: data.user,
          accessToken: data.tokens.accessToken,
          refreshToken: data.tokens.refreshToken,
          isAuthenticated: true,
        });

        return {};
      },

      verify2FA: async (tempToken, code) => {
        const res = await api.post('/auth/verify-2fa', { tempToken, code });
        const data = res.data;

        set({
          user: data.user,
          accessToken: data.tokens.accessToken,
          refreshToken: data.tokens.refreshToken,
          isAuthenticated: true,
        });
      },

      logout: async () => {
        try {
          const { refreshToken } = get();
          if (refreshToken) {
            await api.post('/auth/logout', { refreshToken });
          }
        } catch {
          // Ignore logout errors
        }
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
        // Clear all cached data to prevent data leakage on shared devices
        try {
          if ('caches' in window) {
            const names = await caches.keys();
            await Promise.all(names.map((n) => caches.delete(n)));
          }
        } catch { /* ignore */ }
        localStorage.removeItem('timetrack-auth');
      },

      refresh: async () => {
        const { refreshToken } = get();
        if (!refreshToken) {
          set({ isAuthenticated: false });
          return;
        }

        try {
          const res = await api.post('/auth/refresh', { refreshToken });
          set({
            accessToken: res.data.tokens.accessToken,
            refreshToken: res.data.tokens.refreshToken,
          });
        } catch {
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
          });
        }
      },

      setTokens: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken });
      },
    }),
    {
      name: 'timetrack-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
