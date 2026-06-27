// 项目状态管理

import { create } from "zustand";
import {
  projectAPI,
  requirementAPI,
  architectureAPI,
  documentAPI,
  attachmentAPI,
} from "@/lib/api";

// ===== 项目 Store =====
export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  owner_id: string;
  created_at: string | null;
}

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  fetchProjects: () => Promise<void>;
  fetchProject: (id: string) => Promise<void>;
  createProject: (data: { name: string; description?: string }) => Promise<Project>;
  updateProject: (id: string, data: Record<string, unknown>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setCurrentProject: (project: Project | null) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  isLoading: false,

  fetchProjects: async () => {
    set({ isLoading: true });
    try {
      const response = await projectAPI.list();
      set({ projects: response.data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  fetchProject: async (id: string) => {
    set({ isLoading: true });
    try {
      const response = await projectAPI.get(id);
      set({ currentProject: response.data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createProject: async (data) => {
    const response = await projectAPI.create(data);
    const newProject = response.data;
    set((state) => ({ projects: [...state.projects, newProject] }));
    return newProject;
  },

  updateProject: async (id, data) => {
    await projectAPI.update(id, data);
    await get().fetchProject(id);
  },

  deleteProject: async (id) => {
    await projectAPI.delete(id);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProject:
        state.currentProject?.id === id ? null : state.currentProject,
    }));
  },

  setCurrentProject: (project) => set({ currentProject: project }),
}));

// ===== 需求 Store =====
export interface Requirement {
  id: string;
  project_id: string;
  title: string;
  description: string;
  source: string | null;
  req_type: string | null;
  priority: string | null;
  status: string;
  analysis_result: Record<string, unknown> | null;
  created_by: string;
  created_at: string | null;
}

export interface UseCase {
  id: string;
  requirement_id: string;
  title: string;
  actor: string;
  preconditions: string | null;
  main_flow: string[] | null;
  alternative_flows: string[] | null;
  postconditions: string | null;
}

interface RequirementState {
  requirements: Requirement[];
  currentRequirement: Requirement | null;
  isAnalyzing: boolean;
  analysisProgress: string;
  analysisError: boolean;
  useCases: UseCase[];
  fetchRequirements: (projectId: string) => Promise<void>;
  fetchRequirement: (projectId: string, reqId: string) => Promise<void>;
  createRequirement: (
    projectId: string,
    data: { title: string; description: string; source?: string }
  ) => Promise<void>;
  updateRequirement: (
    projectId: string,
    reqId: string,
    data: Record<string, unknown>
  ) => Promise<void>;
  analyzeRequirements: (
    projectId: string,
    requirementIds?: string[]
  ) => Promise<void>;
  confirmRequirement: (projectId: string, reqId: string) => Promise<void>;
  fetchUseCases: (projectId: string, reqId: string) => Promise<void>;
  setCurrentRequirement: (req: Requirement | null) => void;
}

export const useRequirementStore = create<RequirementState>((set, get) => ({
  requirements: [],
  currentRequirement: null,
  isAnalyzing: false,
  analysisProgress: "",
  analysisError: false,
  useCases: [],

  fetchRequirements: async (projectId) => {
    try {
      const response = await requirementAPI.list(projectId);
      set({ requirements: response.data });
    } catch {
      // 静默处理
    }
  },

  fetchRequirement: async (projectId, reqId) => {
    try {
      const response = await requirementAPI.get(projectId, reqId);
      set({ currentRequirement: response.data });
    } catch {
      // 静默处理
    }
  },

  createRequirement: async (projectId, data) => {
    await requirementAPI.create(projectId, data);
    await get().fetchRequirements(projectId);
  },

  updateRequirement: async (projectId, reqId, data) => {
    await requirementAPI.update(projectId, reqId, data);
    await get().fetchRequirement(projectId, reqId);
  },

  analyzeRequirements: async (projectId, requirementIds) => {
    set({ isAnalyzing: true, analysisProgress: "正在进行 AI 需求分析..." });
    try {
      await requirementAPI.analyze(projectId, {
        requirement_ids: requirementIds,
      });
      set({ analysisProgress: "分析完成，正在刷新数据..." });
      await get().fetchRequirements(projectId);
      set({ analysisProgress: "", isAnalyzing: false });
    } catch {
      set({
        analysisProgress: "分析失败，请重试",
        isAnalyzing: false,
        analysisError: true,
      });
      // 3秒后清除错误状态
      setTimeout(() => set({ analysisError: false }), 3000);
    }
  },

  confirmRequirement: async (projectId, reqId) => {
    await requirementAPI.confirm(projectId, reqId);
    await get().fetchRequirement(projectId, reqId);
  },

  fetchUseCases: async (projectId, reqId) => {
    try {
      const response = await requirementAPI.getUseCases(projectId, reqId);
      set({ useCases: response.data });
    } catch {
      // 静默处理
    }
  },

  setCurrentRequirement: (req) => set({ currentRequirement: req }),
}));

// ===== 架构 Store =====
export interface ArchitectureSolution {
  id: string;
  project_id: string;
  name: string;
  pattern: string | null;
  description: string | null;
  version: number;
  status: string;
  recommendation: Record<string, unknown> | null;
  quality_scores: Record<string, unknown> | null;
  created_by: string;
  created_at: string | null;
}

interface ArchitectureState {
  solutions: ArchitectureSolution[];
  currentSolution: ArchitectureSolution | null;
  isRecommending: boolean;
  archDoc: string | null;
  plantumlCode: string | null;
  isGeneratingDoc: boolean;
  isGeneratingPlantuml: boolean;
  fetchSolutions: (projectId: string) => Promise<void>;
  fetchSolution: (projectId: string, solutionId: string) => Promise<void>;
  recommendArchitecture: (
    projectId: string,
    data?: { quality_attributes?: string[]; constraints?: Record<string, unknown> }
  ) => Promise<void>;
  createReview: (
    projectId: string,
    solutionId: string,
    data: { comment: string; rating?: number }
  ) => Promise<void>;
  createADR: (
    projectId: string,
    solutionId: string,
    data: { title: string; context: string; decision: string; consequences?: string }
  ) => Promise<void>;
  autoMapTraceability: (projectId: string) => Promise<void>;
  generateArchDoc: (projectId: string, solutionId: string) => Promise<string | null>;
  generatePlantuml: (projectId: string, solutionId: string) => Promise<string | null>;
  setCurrentSolution: (solution: ArchitectureSolution | null) => void;
}

export const useArchitectureStore = create<ArchitectureState>((set, get) => ({
  solutions: [],
  currentSolution: null,
  isRecommending: false,
  archDoc: null,
  plantumlCode: null,
  isGeneratingDoc: false,
  isGeneratingPlantuml: false,

  fetchSolutions: async (projectId) => {
    try {
      const response = await architectureAPI.list(projectId);
      set({ solutions: response.data });
    } catch {
      // 静默处理
    }
  },

  fetchSolution: async (projectId, solutionId) => {
    try {
      const response = await architectureAPI.get(projectId, solutionId);
      set({ currentSolution: response.data });
    } catch {
      // 静默处理
    }
  },

  recommendArchitecture: async (projectId, data) => {
    set({ isRecommending: true });
    try {
      await architectureAPI.recommend(projectId, data);
      await get().fetchSolutions(projectId);
      set({ isRecommending: false });
    } catch {
      set({ isRecommending: false });
    }
  },

  createReview: async (projectId, solutionId, data) => {
    await architectureAPI.createReview(projectId, solutionId, data);
    await get().fetchSolution(projectId, solutionId);
  },

  createADR: async (projectId, solutionId, data) => {
    await architectureAPI.createADR(projectId, solutionId, data);
    await get().fetchSolution(projectId, solutionId);
  },

  autoMapTraceability: async (projectId) => {
    await architectureAPI.autoMapTraceability(projectId);
  },

  generateArchDoc: async (projectId, solutionId) => {
    set({ isGeneratingDoc: true });
    try {
      const response = await architectureAPI.generateArchDoc(projectId, solutionId);
      const doc = response.data?.content ?? response.data ?? null;
      set({ archDoc: typeof doc === "string" ? doc : JSON.stringify(doc, null, 2), isGeneratingDoc: false });
      return typeof doc === "string" ? doc : JSON.stringify(doc, null, 2);
    } catch {
      set({ isGeneratingDoc: false });
      return null;
    }
  },

  generatePlantuml: async (projectId, solutionId) => {
    set({ isGeneratingPlantuml: true });
    try {
      const response = await architectureAPI.generatePlantuml(projectId, solutionId);
      const code = response.data?.plantuml ?? response.data?.content ?? null;
      set({ plantumlCode: typeof code === "string" ? code : JSON.stringify(code, null, 2), isGeneratingPlantuml: false });
      return typeof code === "string" ? code : JSON.stringify(code, null, 2);
    } catch {
      set({ isGeneratingPlantuml: false });
      return null;
    }
  },

  setCurrentSolution: (solution) => set({ currentSolution: solution }),
}));

// ===== 文档 Store =====
export interface DocumentItem {
  id: string;
  title: string;
  doc_type: string;
  version: number;
  content?: string;
  created_at: string | null;
}

interface DocumentState {
  documents: DocumentItem[];
  currentDocument: DocumentItem | null;
  isGenerating: boolean;
  isUpdating: boolean;
  compareResult: { diff: string; v1?: unknown; v2?: unknown } | null;
  fetchDocuments: (projectId: string) => Promise<void>;
  generateDocument: (projectId: string) => Promise<void>;
  fetchDocument: (projectId: string, docId: string) => Promise<void>;
  updateDocument: (
    projectId: string,
    docId: string,
    data: { content: string; title?: string }
  ) => Promise<void>;
  compareDocuments: (projectId: string, v1: string, v2: string) => Promise<void>;
  exportDocument: (projectId: string, docId: string, format: string) => Promise<Blob | null>;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  currentDocument: null,
  isGenerating: false,
  isUpdating: false,
  compareResult: null,

  fetchDocuments: async (projectId) => {
    try {
      const response = await documentAPI.list(projectId);
      set({ documents: response.data });
    } catch {
      // 静默处理
    }
  },

  generateDocument: async (projectId) => {
    set({ isGenerating: true });
    try {
      await documentAPI.generate(projectId);
      await get().fetchDocuments(projectId);
      set({ isGenerating: false });
    } catch {
      set({ isGenerating: false });
    }
  },

  fetchDocument: async (projectId, docId) => {
    try {
      const response = await documentAPI.get(projectId, docId);
      set({ currentDocument: response.data });
    } catch {
      // 静默处理
    }
  },

  updateDocument: async (projectId, docId, data) => {
    set({ isUpdating: true });
    try {
      await documentAPI.update(projectId, docId, data);
      await get().fetchDocument(projectId, docId);
      await get().fetchDocuments(projectId);
      set({ isUpdating: false });
    } catch {
      set({ isUpdating: false });
    }
  },

  compareDocuments: async (projectId, v1, v2) => {
    try {
      const response = await documentAPI.compare(projectId, v1, v2);
      set({ compareResult: response.data });
    } catch {
      // 静默处理
    }
  },

  exportDocument: async (projectId, docId, format) => {
    try {
      const response = await documentAPI.exportDoc(projectId, docId, format);
      return response.data as Blob;
    } catch {
      return null;
    }
  },
}));

// ===== 附件 Store =====
export interface Attachment {
  id: string;
  filename: string;
  file_size: number;
  file_type: string | null;
  uploaded_at: string | null;
}

interface AttachmentState {
  attachments: Attachment[];
  isUploading: boolean;
  fetchAttachments: (projectId: string) => Promise<void>;
  uploadAttachment: (projectId: string, file: File) => Promise<void>;
  deleteAttachment: (projectId: string, attachmentId: string) => Promise<void>;
}

export const useAttachmentStore = create<AttachmentState>((set, get) => ({
  attachments: [],
  isUploading: false,

  fetchAttachments: async (projectId) => {
    try {
      const response = await attachmentAPI.list(projectId);
      set({ attachments: response.data });
    } catch {
      // 静默处理
    }
  },

  uploadAttachment: async (projectId, file) => {
    set({ isUploading: true });
    try {
      await attachmentAPI.upload(projectId, file);
      await get().fetchAttachments(projectId);
      set({ isUploading: false });
    } catch {
      set({ isUploading: false });
    }
  },

  deleteAttachment: async (projectId, attachmentId) => {
    try {
      await attachmentAPI.delete(projectId, attachmentId);
      await get().fetchAttachments(projectId);
    } catch {
      // 静默处理
    }
  },
}));
