// API 调用封装

import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5分钟，AI分析可能需要较长时间
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
  getUseCases: (projectId: string, reqId: string) =>
    api.get(`/projects/${projectId}/requirements/${reqId}/use-cases`),
  importAndAnalyze: (projectId: string, content: string, attachmentId?: string) =>
    api.post(`/projects/${projectId}/requirements/import-and-analyze`, {
      content,
      attachment_id: attachmentId,
    }),
  generateDiagrams: (projectId: string, reqId: string) =>
    api.post(`/projects/${projectId}/requirements/${reqId}/generate-diagrams`),
  delete: (projectId: string, reqId: string) =>
    api.delete(`/projects/${projectId}/requirements/${reqId}`),
  reAnalyze: (projectId: string, reqId: string) =>
    api.post(`/projects/${projectId}/requirements/${reqId}/re-analyze`),
  suggestRequirement: (projectId: string, data: { title: string; description: string }) =>
    api.post(`/projects/${projectId}/requirements/suggest`, data),
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
  getTraceabilityMatrix: (projectId: string) =>
    api.get(`/projects/${projectId}/architectures/traceability/matrix`),
  generateArchDoc: (projectId: string, solutionId: string) =>
    api.post(`/projects/${projectId}/architectures/${solutionId}/generate-doc`),
  generatePlantuml: (projectId: string, solutionId: string) =>
    api.post(`/projects/${projectId}/architectures/${solutionId}/generate-plantuml`),

  // ===== Solution 编辑 =====
  updateSolution: (projectId: string, solutionId: string, data: Record<string, unknown>) =>
    api.put(`/projects/${projectId}/architectures/${solutionId}`, data),

  // ===== Review 管理 =====
  listReviews: (projectId: string, solutionId: string) =>
    api.get(`/projects/${projectId}/architectures/${solutionId}/reviews`),
  getReview: (projectId: string, solutionId: string, reviewId: string) =>
    api.get(`/projects/${projectId}/architectures/${solutionId}/reviews/${reviewId}`),
  updateReview: (projectId: string, solutionId: string, reviewId: string, data: Record<string, unknown>) =>
    api.put(`/projects/${projectId}/architectures/${solutionId}/reviews/${reviewId}`, data),
  deleteReview: (projectId: string, solutionId: string, reviewId: string) =>
    api.delete(`/projects/${projectId}/architectures/${solutionId}/reviews/${reviewId}`),

  // ===== ADR 管理 =====
  listADRs: (projectId: string, solutionId: string) =>
    api.get(`/projects/${projectId}/architectures/${solutionId}/adrs`),
  getADR: (projectId: string, solutionId: string, adrId: string) =>
    api.get(`/projects/${projectId}/architectures/${solutionId}/adrs/${adrId}`),
  updateADR: (projectId: string, solutionId: string, adrId: string, data: Record<string, unknown>) =>
    api.put(`/projects/${projectId}/architectures/${solutionId}/adrs/${adrId}`, data),
  deleteADR: (projectId: string, solutionId: string, adrId: string) =>
    api.delete(`/projects/${projectId}/architectures/${solutionId}/adrs/${adrId}`),

  // ===== Component CRUD =====
  listComponents: (projectId: string, solutionId: string) =>
    api.get(`/projects/${projectId}/architectures/${solutionId}/components`),
  getComponent: (projectId: string, solutionId: string, componentId: string) =>
    api.get(`/projects/${projectId}/architectures/${solutionId}/components/${componentId}`),
  createComponent: (projectId: string, solutionId: string, data: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/architectures/${solutionId}/components`, data),
  updateComponent: (projectId: string, solutionId: string, componentId: string, data: Record<string, unknown>) =>
    api.put(`/projects/${projectId}/architectures/${solutionId}/components/${componentId}`, data),
  deleteComponent: (projectId: string, solutionId: string, componentId: string) =>
    api.delete(`/projects/${projectId}/architectures/${solutionId}/components/${componentId}`),

  // ===== TraceabilityLink 管理 =====
  listTraceabilityLinks: (projectId: string, solutionId: string) =>
    api.get(`/projects/${projectId}/architectures/${solutionId}/traceability/links`),
  createTraceabilityLink: (projectId: string, solutionId: string, data: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/architectures/${solutionId}/traceability/links`, data),
  updateTraceabilityLink: (projectId: string, solutionId: string, linkId: string, data: Record<string, unknown>) =>
    api.put(`/projects/${projectId}/architectures/${solutionId}/traceability/links/${linkId}`, data),
  deleteTraceabilityLink: (projectId: string, solutionId: string, linkId: string) =>
    api.delete(`/projects/${projectId}/architectures/${solutionId}/traceability/links/${linkId}`),
  getComponentRequirements: (projectId: string, solutionId: string, componentId: string) =>
    api.get(`/projects/${projectId}/architectures/${solutionId}/components/${componentId}/requirements`),
};

// ===== 文档 API =====
export const documentAPI = {
  generate: (projectId: string) =>
    api.post(`/projects/${projectId}/documents/generate`),
  list: (projectId: string) =>
    api.get(`/projects/${projectId}/documents`),
  get: (projectId: string, docId: string) =>
    api.get(`/projects/${projectId}/documents/${docId}`),
  update: (projectId: string, docId: string, data: { content: string; title?: string }) =>
    api.put(`/projects/${projectId}/documents/${docId}`, data),
  compare: (projectId: string, v1: string, v2: string) =>
    api.get(`/projects/${projectId}/documents/compare`, { params: { v1, v2 } }),
  exportDoc: (projectId: string, docId: string, format: string) =>
    api.get(`/projects/${projectId}/documents/${docId}/export`, { params: { format }, responseType: "blob" }),
};

// ===== 附件 API =====
export const attachmentAPI = {
  upload: (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post(`/projects/${projectId}/attachments`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  list: (projectId: string) => api.get(`/projects/${projectId}/attachments`),
  download: (projectId: string, attachmentId: string) =>
    api.get(`/projects/${projectId}/attachments/${attachmentId}/download`, { responseType: "blob" }),
  delete: (projectId: string, attachmentId: string) =>
    api.delete(`/projects/${projectId}/attachments/${attachmentId}`),
};

// ===== 管理员 API =====
export const adminAPI = {
  listUsers: () => api.get("/admin/users"),
  updateUserRole: (userId: string, role: string) =>
    api.put(`/admin/users/${userId}/role`, { role }),
  toggleUserStatus: (userId: string) =>
    api.put(`/admin/users/${userId}/status`),
  getDashboard: () => api.get("/admin/dashboard"),
  getStatistics: () => api.get("/admin/statistics"),
  getLogs: (params?: { page?: number; page_size?: number; action?: string; user_id?: string; target_type?: string; start_date?: string; end_date?: string }) =>
    api.get("/admin/logs", { params }),
  getLogDetail: (logId: string) =>
    api.get(`/admin/logs/${logId}`),
  exportLogs: (params?: { action?: string; user_id?: string; target_type?: string; start_date?: string; end_date?: string }) =>
    api.get("/admin/logs/export", { params, responseType: "blob" }),
};

// ===== AI 评审 & 统计 API =====
export const aiReviewAPI = {
  // AI 架构评审
  aiArchReview: (projectId: string, solutionId: string) =>
    api.post(`/projects/${projectId}/architectures/${solutionId}/ai-review`),
  // 架构方案统计
  getArchStats: (projectId: string, solutionId: string) =>
    api.get(`/projects/${projectId}/architectures/${solutionId}/stats`),
  // 需求统计
  getRequirementStats: (projectId: string, requirementId: string) =>
    api.get(`/projects/${projectId}/requirements/${requirementId}/stats`),
};

export default api;