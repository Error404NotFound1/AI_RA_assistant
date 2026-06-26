// 认证状态管理

import { create } from "zustand";
import { authAPI } from "@/lib/api";

export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  role: "RE" | "SA" | "admin";
  is_active: boolean;
  created_at: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: {
    username: string;
    email: string;
    password: string;
    full_name?: string;
    role?: string;
  }) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (username: string, password: string) => {
    const response = await authAPI.login({ username, password });
    const { access_token, refresh_token } = response.data;
    localStorage.setItem("access_token", access_token);
    localStorage.setItem("refresh_token", refresh_token);
    // 获取用户信息
    const userRes = await authAPI.getMe();
    set({
      user: userRes.data,
      isAuthenticated: true,
      isLoading: false,
    });
  },

  register: async (data) => {
    await authAPI.register(data);
    // 注册后不自动登录，跳转到登录页
  },

  logout: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    set({ user: null, isAuthenticated: false, isLoading: false });
    window.location.href = "/login";
  },

  fetchUser: async () => {
    try {
      const response = await authAPI.getMe();
      set({ user: response.data, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  initialize: async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }
    try {
      const response = await authAPI.getMe();
      set({ user: response.data, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
