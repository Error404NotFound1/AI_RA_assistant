// API 调用封装

import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// 请求拦截器：自动添加 token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：处理 401 自动跳转
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// ===== 认证 API =====
export const authAPI = {
  register: (data: { username: string; email: string; password: string; full_name?: string; role?: string }) =>
    api.post("/auth/register", data),
  login: (data: { username: string; password: string }) =>
    api.post("/auth/login", data),
  refresh: (refreshToken: string) =>
    api.post("/auth/refresh", { refresh_token: refreshToken }),
  getMe: () => api.get("/auth/me"),
};

// ===== 项目 API =====
export const projectAPI = {
  list: () => api.get("/projects"),
  create: (data: { name: string; description?: string }) => api.post("/projects", data),
  get: (id: string) => api.get(`/projects/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.put(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  addMember: (projectId: string, data: { user_id: string; role: string }) =>
    api.post(`/projects/${projectId}/members`, data),
};

// ===== 需求 API =====
export const requirementAPI = {
  list: (projectId: string) => api.get(`/projects/${projectId}/requirements`),
  create: (projectId: string, data: { title: string; description: string; source?: string }) =>
    api.post(`/projects/${projectId}/requirements`, data),
  get: (projectId: string, reqId: string) =>
    api.get(`/projects/${projectId}/requirements/${reqId}`),
  update: (projectId: string, reqId: string, data: Record<string, unknown>) =>
    api.put(`/projects/${projectId}/requirements/${reqId}`, data),
  analyze: (projectId: string, data?: { requirement_ids?: string[] }) =>
    api.post(`/projects/${projectId}/requirements/analyze`, data || {}),
  confirm: (projectId: string, reqId: string) =>
    api.put(`/projects/${projectId}/requirements/${reqId}/confirm`),
  getQuality: (projectId: string, reqId: string) =>
    api.get(`/projects/${projectId}/requirements/${reqId}/quality`),
};

// ===== 架构 API =====
export const architectureAPI = {
  recommend: (projectId: string, data?: { quality_attributes?: string[]; constraints?: Record<string, unknown> }) =>
    api.post(`/projects/${projectId}/architectures/recommend`, data || {}),
  list: (projectId: string) => api.get(`/projects/${projectId}/architectures`),
  get: (projectId: string, solutionId: string) =>
    api.get(`/projects/${projectId}/architectures/${solutionId}`),
  createReview: (projectId: string, solutionId: string, data: { comment: string; rating?: number }) =>
    api.post(`/projects/${projectId}/architectures/${solutionId}/reviews`, data),
  createADR: (projectId: string, solutionId: string, data: { title: string; context: string; decision: string; consequences?: string }) =>
    api.post(`/projects/${projectId}/architectures/${solutionId}/adr`, data),
  autoMapTraceability: (projectId: string) =>
    api.post(`/projects/${projectId}/architectures/traceability/auto-map`),
};

// ===== 管理员 API =====
export const adminAPI = {
  listUsers: () => api.get("/admin/users"),
  updateUserRole: (userId: string, role: string) =>
    api.put(`/admin/users/${userId}/role`, { role }),
  toggleUserStatus: (userId: string) =>
    api.put(`/admin/users/${userId}/status`),
  getDashboard: () => api.get("/admin/dashboard"),
  getLogs: (params?: { action?: string; limit?: number }) =>
    api.get("/admin/logs", { params }),
};

export default api;