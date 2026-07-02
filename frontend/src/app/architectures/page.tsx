// 架构设计与 AI 推荐页面 — 完整版
// 包含：AI推荐、方案管理、组件CRUD、评审CRUD、ADR CRUD、AI评审、状态流转、PlantUML 渲染

"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  BrainCircuit,
  LayoutDashboard,
  Star,
  MessageSquare,
  FileCheck,
  GitBranch,
  ChevronDown,
  ChevronUp,
  FileText,
  Code2,
  ImageIcon,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  Cpu,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Eye,
} from "lucide-react";
import MDEditor from "@uiw/react-md-editor";
import { encode as plantumlEncode } from "plantuml-encoder";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useProjectStore,
  useArchitectureStore,
} from "@/lib/project-store";
import { aiReviewAPI } from "@/lib/api";

// ─────────────────────────── 常量 ───────────────────────────

const QUALITY_ATTRIBUTES = [
  "性能", "可用性", "安全性", "可修改性", "可测试性",
  "易用性", "互操作性", "可靠性",
];

const SOLUTION_STATUS_LABELS: Record<string, string> = {
  proposed: "待评审",
  selected: "已选定",
  reviewed: "已评审",
  confirmed: "已确认",
};
const SOLUTION_STATUS_NEXT: Record<string, string> = {
  proposed: "selected",
  selected: "reviewed",
  reviewed: "confirmed",
};
const SOLUTION_STATUS_COLOR: Record<string, string> = {
  proposed: "bg-yellow-100 text-yellow-700 border-yellow-300",
  selected: "bg-blue-100 text-blue-700 border-blue-300",
  reviewed: "bg-purple-100 text-purple-700 border-purple-300",
  confirmed: "bg-green-100 text-green-700 border-green-300",
};

const REVIEW_STATUS_LABELS: Record<string, string> = {
  open: "待处理",
  addressed: "已响应",
  resolved: "已解决",
};
const REVIEW_STATUS_NEXT: Record<string, string> = {
  open: "addressed",
  addressed: "resolved",
};
const REVIEW_STATUS_COLOR: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  addressed: "bg-yellow-100 text-yellow-700",
  resolved: "bg-green-100 text-green-700",
};

const ADR_STATUS_LABELS: Record<string, string> = {
  proposed: "草案",
  accepted: "已接受",
  deprecated: "已废弃",
  superseded: "已替代",
};
const ADR_STATUS_COLOR: Record<string, string> = {
  proposed: "bg-yellow-100 text-yellow-700",
  accepted: "bg-green-100 text-green-700",
  deprecated: "bg-gray-100 text-gray-600",
  superseded: "bg-red-100 text-red-700",
};

/** 将质量评分统一为 0-100 数值（兼容 LLM 返回的嵌套对象） */
function normalizeQualityScore(value: unknown): number {
  if (typeof value === "number") return Math.min(100, Math.max(0, value));
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.score === "number") return Math.min(100, Math.max(0, obj.score * 10));
    if (typeof obj.value === "number") return Math.min(100, Math.max(0, obj.value));
  }
  return 0;
}

// ─────────────────────────── 类型 ───────────────────────────

interface Review {
  id: string;
  solution_id: string;
  reviewer_id: string;
  comment: string;
  rating: number;
  status: string;
  created_at: string | null;
}

interface ADR {
  id: string;
  solution_id: string;
  project_id: string;
  title: string;
  context: string;
  decision: string;
  consequences: string | null;
  status: string;
  created_at: string | null;
}

interface ManagedComponent {
  id: string;
  solution_id: string;
  name: string;
  comp_type: string;
  responsibility: string | null;
  interfaces: unknown;
  dependencies: unknown;
}

interface AIReviewResult {
  review_id: string;
  overall_rating: number;
  summary: string;
  quality_assessment: Record<string, unknown> | null;
  pattern_fitness: Record<string, unknown> | null;
  component_analysis: unknown[] | null;
  defects: unknown[] | null;
  suggestions: unknown[] | null;
}

// ─────────────────────────── 子组件：架构方案详情卡 ───────────────────────────

function ArchitectureDetailCard({
  solution,
  projectId,
}: {
  solution: {
    id: string;
    name: string;
    pattern: string | null;
    description: string | null;
    version: number;
    status: string;
    recommendation: Record<string, unknown> | null;
    quality_scores: Record<string, unknown> | null;
  };
  projectId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const {
    createReview, createADR,
    generateArchDoc, generatePlantuml,
    isGeneratingDoc, isGeneratingPlantuml,
    fetchReviews, updateReviewStatus, deleteReview,
    fetchADRs, updateADR, deleteADR,
    fetchManagedComponents, createManagedComponent, updateManagedComponent, deleteManagedComponent,
    updateSolution,
    fetchSolutions,
    reviews, adrs, managedComponents,
  } = useArchitectureStore();

  const [localReviews, setLocalReviews] = useState<Review[]>([]);
  const [localADRs, setLocalADRs] = useState<ADR[]>([]);
  const [localComponents, setLocalComponents] = useState<ManagedComponent[]>([]);
  const [localArchDoc, setLocalArchDoc] = useState<string | null>(null);
  const [localPlantuml, setLocalPlantuml] = useState<string | null>(null);
  const [aiReviewResult, setAIReviewResult] = useState<AIReviewResult | null>(null);
  const [isAIReviewing, setIsAIReviewing] = useState(false);

  // Dialog 状态
  const [reviewDialog, setReviewDialog] = useState(false);
  const [adrDialog, setADRDialog] = useState(false);
  const [editADRDialog, setEditADRDialog] = useState<ADR | null>(null);
  const [compDialog, setCompDialog] = useState(false);
  const [editCompDialog, setEditCompDialog] = useState<ManagedComponent | null>(null);
  const [aiReviewDialog, setAIReviewDialog] = useState(false);
  const [confirmDeleteReview, setConfirmDeleteReview] = useState<string | null>(null);
  const [confirmDeleteADR, setConfirmDeleteADR] = useState<string | null>(null);
  const [confirmDeleteComp, setConfirmDeleteComp] = useState<string | null>(null);

  const [reviewForm, setReviewForm] = useState({ comment: "", rating: 3 });
  const [adrForm, setADRForm] = useState({ title: "", context: "", decision: "", consequences: "" });
  const [compForm, setCompForm] = useState({ name: "", comp_type: "service", responsibility: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [solutionStatus, setSolutionStatus] = useState(solution.status);

  useEffect(() => {
    setSolutionStatus(solution.status);
  }, [solution.status]);

  const recommendation = solution.recommendation as {
    recommended_patterns?: Array<{ name: string; suitability_score?: number; pros?: string[]; cons?: string[]; reason?: string }>;
    components?: Array<{ name: string; type: string; responsibility?: string; technology?: string }>;
    quality_verification?: Record<string, number>;
    rationale?: string;
    trade_offs?: string;
    tech_stack?: Record<string, string[]>;
  } | null;

  const qualityScores = solution.quality_scores as Record<string, number> | null;

  // 展开时自动加载数据
  const loadTabData = useCallback(async (tab: string) => {
    if (tab === "reviews") {
      await fetchReviews(projectId, solution.id);
    } else if (tab === "adrs") {
      await fetchADRs(projectId, solution.id);
    } else if (tab === "components") {
      await fetchManagedComponents(projectId, solution.id);
    }
  }, [projectId, solution.id, fetchReviews, fetchADRs, fetchManagedComponents]);

  useEffect(() => {
    if (expanded) loadTabData(activeTab);
  }, [expanded, activeTab, loadTabData]);

  // 同步 store 数据到本地
  useEffect(() => { setLocalReviews(reviews as Review[]); }, [reviews]);
  useEffect(() => { setLocalADRs(adrs as ADR[]); }, [adrs]);
  useEffect(() => { setLocalComponents(managedComponents as ManagedComponent[]); }, [managedComponents]);

  // ─── 方案状态推进 ───
  const handleAdvanceStatus = async () => {
    const next = SOLUTION_STATUS_NEXT[solutionStatus];
    if (!next) return;
    await updateSolution(projectId, solution.id, { status: next });
    setSolutionStatus(next);
    await fetchSolutions(projectId);
  };

  // ─── 生成文档 / PlantUML ───
  const handleGenerateDoc = async () => {
    const result = await generateArchDoc(projectId, solution.id);
    if (result) setLocalArchDoc(result);
  };
  const handleGeneratePlantuml = async () => {
    const result = await generatePlantuml(projectId, solution.id);
    if (result) setLocalPlantuml(result);
  };

  // ─── AI 评审 ───
  const handleAIReview = async () => {
    setIsAIReviewing(true);
    try {
      const res = await aiReviewAPI.aiArchReview(projectId, solution.id);
      setAIReviewResult(res.data as AIReviewResult);
      setAIReviewDialog(true);
      await fetchReviews(projectId, solution.id);
    } catch {
      // 静默处理
    } finally {
      setIsAIReviewing(false);
    }
  };

  // ─── 提交评审 ───
  const handleSubmitReview = async () => {
    setIsSubmitting(true);
    try {
      await createReview(projectId, solution.id, reviewForm);
      setReviewDialog(false);
      setReviewForm({ comment: "", rating: 3 });
      await fetchReviews(projectId, solution.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── 提交 ADR ───
  const handleSubmitADR = async () => {
    setIsSubmitting(true);
    try {
      await createADR(projectId, solution.id, adrForm);
      setADRDialog(false);
      setADRForm({ title: "", context: "", decision: "", consequences: "" });
      await fetchADRs(projectId, solution.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── 保存编辑 ADR ───
  const handleSaveADR = async () => {
    if (!editADRDialog) return;
    setIsSubmitting(true);
    try {
      await updateADR(projectId, solution.id, editADRDialog.id, {
        title: editADRDialog.title,
        context: editADRDialog.context,
        decision: editADRDialog.decision,
        consequences: editADRDialog.consequences,
        status: editADRDialog.status,
      });
      setEditADRDialog(null);
      await fetchADRs(projectId, solution.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── 提交新组件 ───
  const handleSubmitComp = async () => {
    setIsSubmitting(true);
    try {
      await createManagedComponent(projectId, solution.id, compForm);
      setCompDialog(false);
      setCompForm({ name: "", comp_type: "service", responsibility: "" });
      await fetchManagedComponents(projectId, solution.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── 保存编辑组件 ───
  const handleSaveComp = async () => {
    if (!editCompDialog) return;
    setIsSubmitting(true);
    try {
      await updateManagedComponent(projectId, solution.id, editCompDialog.id, {
        name: editCompDialog.name,
        comp_type: editCompDialog.comp_type,
        responsibility: editCompDialog.responsibility,
      });
      setEditCompDialog(null);
      await fetchManagedComponents(projectId, solution.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── 推进评审状态 ───
  const handleAdvanceReview = async (reviewId: string, currentStatus: string) => {
    const next = REVIEW_STATUS_NEXT[currentStatus];
    if (!next) return;
    await updateReviewStatus(projectId, solution.id, reviewId, { status: next });
    await fetchReviews(projectId, solution.id);
  };

  return (
    <Card className="overflow-hidden">
      {/* 卡片头 */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <CardTitle className="text-base truncate">{solution.name}</CardTitle>
              {solution.pattern && <Badge variant="outline">{solution.pattern}</Badge>}
              <Badge variant="secondary">v{solution.version}</Badge>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${SOLUTION_STATUS_COLOR[solutionStatus] ?? "bg-gray-100 text-gray-600"}`}>
                {SOLUTION_STATUS_LABELS[solutionStatus] ?? solutionStatus}
              </span>
            </div>
            <CardDescription className="line-clamp-1">{solution.description || "AI 推荐的架构方案"}</CardDescription>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {SOLUTION_STATUS_NEXT[solutionStatus] && (
              <Button variant="ghost" size="sm" onClick={handleAdvanceStatus} title="推进状态">
                <CheckCircle className="h-4 w-4 text-green-600" />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* 展开区域 */}
      {expanded && (
        <CardContent className="pt-0">
          <Separator className="mb-4" />
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); loadTabData(v); }}>
            <TabsList className="mb-4 flex-wrap h-auto">
              <TabsTrigger value="overview" className="gap-1"><LayoutDashboard className="h-3.5 w-3.5" />概览</TabsTrigger>
              <TabsTrigger value="components" className="gap-1"><Cpu className="h-3.5 w-3.5" />组件管理</TabsTrigger>
              <TabsTrigger value="reviews" className="gap-1"><MessageSquare className="h-3.5 w-3.5" />评审</TabsTrigger>
              <TabsTrigger value="adrs" className="gap-1"><FileCheck className="h-3.5 w-3.5" />ADR</TabsTrigger>
            </TabsList>

            {/* ── Tab 1: 概览 ── */}
            <TabsContent value="overview" className="space-y-4">
              {/* 质量属性评分 */}
              {qualityScores && Object.keys(qualityScores).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-1">
                    <Star className="h-4 w-4 text-yellow-500" />质量属性评分
                  </h4>
                  <div className="grid gap-3 md:grid-cols-2">
                {Object.entries(qualityScores).map(([key, val]) => {
                  const score = normalizeQualityScore(val);
                  return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{key}</span>
                      <span className="text-muted-foreground">{score}/100</span>
                    </div>
                    <Progress value={score} className="h-2" />
                  </div>
                  );
                })}
                  </div>
                </div>
              )}

              {/* 推荐模式 */}
              {recommendation?.recommended_patterns && recommendation.recommended_patterns.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">推荐架构模式</h4>
                  <div className="space-y-2">
                    {recommendation.recommended_patterns.map((p, i) => (
                      <div key={i} className="rounded-md border p-3 text-sm space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{p.name}</span>
                          {p.suitability_score !== undefined && (
                            <Badge variant="secondary">适配度 {p.suitability_score}/100</Badge>
                          )}
                        </div>
                        {p.reason && <p className="text-muted-foreground text-xs">{p.reason}</p>}
                        {p.pros && p.pros.length > 0 && (
                          <p className="text-xs text-green-700">✓ {p.pros.join(" · ")}</p>
                        )}
                        {p.cons && p.cons.length > 0 && (
                          <p className="text-xs text-red-600">✗ {p.cons.join(" · ")}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI 组件列表（来自 recommendation，只读） */}
              {recommendation?.components && recommendation.components.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">AI 推荐组件（只读）</h4>
                  <div className="space-y-2">
                    {recommendation.components.map((comp, i) => (
                      <div key={i} className="rounded-md border p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{comp.name}</span>
                          <Badge variant="outline" className="text-xs">{comp.type}</Badge>
                          {comp.technology && <Badge variant="secondary" className="text-xs">{comp.technology}</Badge>}
                        </div>
                        {comp.responsibility && (
                          <p className="text-xs text-muted-foreground">{comp.responsibility}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 技术栈 */}
              {recommendation?.tech_stack && Object.keys(recommendation.tech_stack).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">技术栈推荐</h4>
                  <div className="grid gap-2 md:grid-cols-2">
                    {Object.entries(recommendation.tech_stack).map(([layer, techs]) => (
                      <div key={layer} className="rounded-md border p-2 text-xs">
                        <span className="font-medium text-muted-foreground">{layer}: </span>
                        {Array.isArray(techs) ? techs.join(", ") : String(techs)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 设计依据 & 权衡 */}
              {recommendation?.rationale && (
                <div>
                  <h4 className="text-sm font-semibold mb-1">设计依据</h4>
                  <p className="text-sm text-muted-foreground bg-muted rounded-md p-3">{recommendation.rationale}</p>
                </div>
              )}
              {recommendation?.trade_offs && (
                <div>
                  <h4 className="text-sm font-semibold mb-1">权衡分析</h4>
                  <p className="text-sm text-muted-foreground bg-muted rounded-md p-3">{recommendation.trade_offs}</p>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={handleGenerateDoc} disabled={isGeneratingDoc}>
                  <FileText className="mr-1.5 h-4 w-4" />
                  {isGeneratingDoc ? "生成中..." : "生成架构文档"}
                </Button>
                <Button size="sm" variant="outline" onClick={handleGeneratePlantuml} disabled={isGeneratingPlantuml}>
                  <Code2 className="mr-1.5 h-4 w-4" />
                  {isGeneratingPlantuml ? "生成中..." : "生成 PlantUML"}
                </Button>
                <Button size="sm" variant="outline" onClick={handleAIReview} disabled={isAIReviewing}>
                  <Sparkles className="mr-1.5 h-4 w-4 text-purple-500" />
                  {isAIReviewing ? "评审中..." : "AI 架构评审"}
                </Button>
              </div>

              {/* 生成的架构文档 */}
              {localArchDoc && (
                <div className="space-y-2 pt-2" data-color-mode="light">
                  <h4 className="text-sm font-semibold flex items-center gap-1">
                    <FileText className="h-4 w-4 text-primary" />架构文档
                  </h4>
                  <div className="rounded-md border p-3 max-h-[400px] overflow-auto">
                    <MDEditor.Markdown source={localArchDoc} />
                  </div>
                </div>
              )}

              {/* PlantUML 图 */}
              {localPlantuml && (
                <div className="space-y-2 pt-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1">
                    <ImageIcon className="h-4 w-4 text-primary" />PlantUML 架构图
                  </h4>
                  <div className="rounded-md border p-3 bg-white overflow-auto">
                    <img
                      src={`http://www.plantuml.com/plantuml/img/${plantumlEncode(localPlantuml)}`}
                      alt="Architecture Diagram"
                      className="max-w-full"
                    />
                  </div>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">查看 PlantUML 源码</summary>
                    <pre className="mt-2 p-3 bg-muted rounded-md overflow-auto whitespace-pre-wrap">{localPlantuml}</pre>
                  </details>
                </div>
              )}
            </TabsContent>

            {/* ── Tab 2: 组件管理 ── */}
            <TabsContent value="components" className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-1">
                  <Cpu className="h-4 w-4" />可编辑组件（共 {localComponents.length} 个）
                </h4>
                <Button size="sm" onClick={() => setCompDialog(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />添加组件
                </Button>
              </div>
              {localComponents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm border rounded-md">
                  暂无组件，点击"添加组件"新增
                </div>
              ) : (
                <div className="space-y-2">
                  {localComponents.map((comp) => (
                    <div key={comp.id} className="border rounded-md p-3 flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-medium text-sm">{comp.name}</span>
                          <Badge variant="outline" className="text-xs">{comp.comp_type}</Badge>
                        </div>
                        {comp.responsibility && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{comp.responsibility}</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => setEditCompDialog({ ...comp })}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteComp(comp.id)}
                          className="text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Tab 3: 评审 ── */}
            <TabsContent value="reviews" className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-1">
                  <MessageSquare className="h-4 w-4" />评审记录（共 {localReviews.length} 条）
                </h4>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleAIReview} disabled={isAIReviewing}>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5 text-purple-500" />
                    {isAIReviewing ? "评审中..." : "AI评审"}
                  </Button>
                  <Button size="sm" onClick={() => setReviewDialog(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />提交评审
                  </Button>
                </div>
              </div>
              {localReviews.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm border rounded-md">
                  暂无评审记录
                </div>
              ) : (
                <div className="space-y-2">
                  {localReviews.map((review) => (
                    <div key={review.id} className="border rounded-md p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <div className="flex">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} className={`h-3.5 w-3.5 ${i < review.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200 fill-gray-200"}`} />
                            ))}
                          </div>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${REVIEW_STATUS_COLOR[review.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {REVIEW_STATUS_LABELS[review.status] ?? review.status}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          {REVIEW_STATUS_NEXT[review.status] && (
                            <Button variant="ghost" size="sm" title="推进状态"
                              onClick={() => handleAdvanceReview(review.id, review.status)}>
                              <RefreshCw className="h-3.5 w-3.5 text-blue-500" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setConfirmDeleteReview(review.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{review.comment}</p>
                      {review.created_at && (
                        <p className="text-xs text-muted-foreground/60">
                          {new Date(review.created_at).toLocaleString("zh-CN")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Tab 4: ADR ── */}
            <TabsContent value="adrs" className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-1">
                  <FileCheck className="h-4 w-4" />架构决策记录（共 {localADRs.length} 条）
                </h4>
                <Button size="sm" onClick={() => setADRDialog(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />创建 ADR
                </Button>
              </div>
              {localADRs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm border rounded-md">
                  暂无架构决策记录
                </div>
              ) : (
                <div className="space-y-3">
                  {localADRs.map((adr) => (
                    <div key={adr.id} className="border rounded-md p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{adr.title}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ADR_STATUS_COLOR[adr.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {ADR_STATUS_LABELS[adr.status] ?? adr.status}
                          </span>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="sm" onClick={() => setEditADRDialog({ ...adr })}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setConfirmDeleteADR(adr.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs space-y-1 text-muted-foreground">
                        <p><span className="font-medium text-foreground">背景：</span>{adr.context}</p>
                        <p><span className="font-medium text-foreground">决策：</span>{adr.decision}</p>
                        {adr.consequences && (
                          <p><span className="font-medium text-foreground">后果：</span>{adr.consequences}</p>
                        )}
                      </div>
                      {adr.created_at && (
                        <p className="text-xs text-muted-foreground/60">
                          {new Date(adr.created_at).toLocaleString("zh-CN")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      )}

      {/* ───────────── Dialogs ───────────── */}

      {/* 提交评审 */}
      <Dialog open={reviewDialog} onOpenChange={setReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>提交架构评审</DialogTitle>
            <DialogDescription>对方案 "{solution.name}" 进行人工评审</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>评分（1-5）</Label>
              <Select value={String(reviewForm.rating)}
                onValueChange={(v) => setReviewForm((p) => ({ ...p, rating: Number(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} — {["", "很差", "较差", "一般", "较好", "很好"][n]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>评审意见</Label>
              <Textarea placeholder="请输入评审意见..." rows={4}
                value={reviewForm.comment}
                onChange={(e) => setReviewForm((p) => ({ ...p, comment: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(false)}>取消</Button>
            <Button onClick={handleSubmitReview} disabled={isSubmitting || !reviewForm.comment}>
              {isSubmitting ? "提交中..." : "提交评审"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 创建 ADR */}
      <Dialog open={adrDialog} onOpenChange={setADRDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>创建架构决策记录 (ADR)</DialogTitle>
            <DialogDescription>记录重要的架构决策及其背景</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>标题</Label>
              <Input placeholder="ADR 标题" value={adrForm.title}
                onChange={(e) => setADRForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>背景 (Context)</Label>
              <Textarea placeholder="描述决策的背景和驱动力" rows={3} value={adrForm.context}
                onChange={(e) => setADRForm((p) => ({ ...p, context: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>决策 (Decision)</Label>
              <Textarea placeholder="描述做出的决策" rows={3} value={adrForm.decision}
                onChange={(e) => setADRForm((p) => ({ ...p, decision: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>后果 (Consequences)</Label>
              <Textarea placeholder="描述决策带来的后果（选填）" rows={2} value={adrForm.consequences}
                onChange={(e) => setADRForm((p) => ({ ...p, consequences: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setADRDialog(false)}>取消</Button>
            <Button onClick={handleSubmitADR}
              disabled={isSubmitting || !adrForm.title || !adrForm.context || !adrForm.decision}>
              {isSubmitting ? "创建中..." : "创建 ADR"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑 ADR */}
      <Dialog open={!!editADRDialog} onOpenChange={(o) => { if (!o) setEditADRDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑 ADR</DialogTitle>
          </DialogHeader>
          {editADRDialog && (
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>标题</Label>
                <Input value={editADRDialog.title}
                  onChange={(e) => setEditADRDialog((p) => p ? { ...p, title: e.target.value } : p)} />
              </div>
              <div className="space-y-1.5">
                <Label>状态</Label>
                <Select value={editADRDialog.status}
                  onValueChange={(v) => setEditADRDialog((p) => p ? { ...p, status: v } : p)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ADR_STATUS_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>背景</Label>
                <Textarea rows={3} value={editADRDialog.context}
                  onChange={(e) => setEditADRDialog((p) => p ? { ...p, context: e.target.value } : p)} />
              </div>
              <div className="space-y-1.5">
                <Label>决策</Label>
                <Textarea rows={3} value={editADRDialog.decision}
                  onChange={(e) => setEditADRDialog((p) => p ? { ...p, decision: e.target.value } : p)} />
              </div>
              <div className="space-y-1.5">
                <Label>后果</Label>
                <Textarea rows={2} value={editADRDialog.consequences ?? ""}
                  onChange={(e) => setEditADRDialog((p) => p ? { ...p, consequences: e.target.value } : p)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditADRDialog(null)}>取消</Button>
            <Button onClick={handleSaveADR} disabled={isSubmitting}>
              {isSubmitting ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加组件 */}
      <Dialog open={compDialog} onOpenChange={setCompDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加架构组件</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>组件名称</Label>
              <Input placeholder="如：API 网关、用户服务..." value={compForm.name}
                onChange={(e) => setCompForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>组件类型</Label>
              <Select value={compForm.comp_type}
                onValueChange={(v) => setCompForm((p) => ({ ...p, comp_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["service", "gateway", "database", "cache", "frontend", "backend", "middleware", "queue", "other"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>职责描述</Label>
              <Textarea placeholder="描述该组件的职责..." rows={3} value={compForm.responsibility}
                onChange={(e) => setCompForm((p) => ({ ...p, responsibility: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompDialog(false)}>取消</Button>
            <Button onClick={handleSubmitComp} disabled={isSubmitting || !compForm.name}>
              {isSubmitting ? "添加中..." : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑组件 */}
      <Dialog open={!!editCompDialog} onOpenChange={(o) => { if (!o) setEditCompDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑组件</DialogTitle>
          </DialogHeader>
          {editCompDialog && (
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>组件名称</Label>
                <Input value={editCompDialog.name}
                  onChange={(e) => setEditCompDialog((p) => p ? { ...p, name: e.target.value } : p)} />
              </div>
              <div className="space-y-1.5">
                <Label>组件类型</Label>
                <Select value={editCompDialog.comp_type}
                  onValueChange={(v) => setEditCompDialog((p) => p ? { ...p, comp_type: v } : p)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["service", "gateway", "database", "cache", "frontend", "backend", "middleware", "queue", "other"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>职责描述</Label>
                <Textarea rows={3} value={editCompDialog.responsibility ?? ""}
                  onChange={(e) => setEditCompDialog((p) => p ? { ...p, responsibility: e.target.value } : p)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCompDialog(null)}>取消</Button>
            <Button onClick={handleSaveComp} disabled={isSubmitting}>
              {isSubmitting ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI 评审结果 */}
      <Dialog open={aiReviewDialog} onOpenChange={setAIReviewDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />AI 架构评审报告
            </DialogTitle>
            <DialogDescription>方案：{solution.name}</DialogDescription>
          </DialogHeader>
          {aiReviewResult && (
            <div className="space-y-4 py-2">
              {/* 总评分 */}
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">{aiReviewResult.overall_rating}</div>
                  <div className="text-xs text-muted-foreground">综合评分/10</div>
                </div>
                <div className="flex-1">
                  <Progress value={(aiReviewResult.overall_rating / 10) * 100} className="h-3 mb-1" />
                  <p className="text-sm">{aiReviewResult.summary}</p>
                </div>
              </div>

              {/* 质量属性评估 */}
              {aiReviewResult.quality_assessment && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                    <Star className="h-4 w-4 text-yellow-500" />质量属性评估
                  </h4>
                  <div className="grid gap-2 md:grid-cols-2">
                    {Object.entries(aiReviewResult.quality_assessment).map(([key, val]) => (
                      <div key={key} className="border rounded p-2 text-xs">
                        <span className="font-medium">{key}: </span>
                        <span className="text-muted-foreground">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 模式适配性 */}
              {aiReviewResult.pattern_fitness && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">架构模式适配性</h4>
                  <div className="border rounded p-3 text-sm space-y-1">
                    {Object.entries(aiReviewResult.pattern_fitness).map(([k, v]) => (
                      <div key={k}><span className="font-medium">{k}: </span>{String(v)}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* 缺陷 */}
              {aiReviewResult.defects && aiReviewResult.defects.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1 text-red-600">
                    <AlertTriangle className="h-4 w-4" />发现缺陷（{aiReviewResult.defects.length} 项）
                  </h4>
                  <div className="space-y-1">
                    {aiReviewResult.defects.map((d, i) => (
                      <div key={i} className="text-sm border border-red-200 bg-red-50 rounded p-2">
                        {typeof d === "object" ? JSON.stringify(d) : String(d)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 改进建议 */}
              {aiReviewResult.suggestions && aiReviewResult.suggestions.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1 text-blue-600">
                    <Eye className="h-4 w-4" />改进建议（{aiReviewResult.suggestions.length} 条）
                  </h4>
                  <div className="space-y-1">
                    {aiReviewResult.suggestions.map((s, i) => (
                      <div key={i} className="text-sm border border-blue-200 bg-blue-50 rounded p-2">
                        {typeof s === "object" ? JSON.stringify(s) : String(s)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setAIReviewDialog(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除评审确认 */}
      <Dialog open={!!confirmDeleteReview} onOpenChange={(o) => { if (!o) setConfirmDeleteReview(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除评审？</DialogTitle>
            <DialogDescription>该操作不可撤销。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteReview(null)}>取消</Button>
            <Button variant="destructive" onClick={async () => {
              if (!confirmDeleteReview) return;
              await deleteReview(projectId, solution.id, confirmDeleteReview);
              await fetchReviews(projectId, solution.id);
              setConfirmDeleteReview(null);
            }}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除 ADR 确认 */}
      <Dialog open={!!confirmDeleteADR} onOpenChange={(o) => { if (!o) setConfirmDeleteADR(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除 ADR？</DialogTitle>
            <DialogDescription>该操作不可撤销。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteADR(null)}>取消</Button>
            <Button variant="destructive" onClick={async () => {
              if (!confirmDeleteADR) return;
              await deleteADR(projectId, solution.id, confirmDeleteADR);
              await fetchADRs(projectId, solution.id);
              setConfirmDeleteADR(null);
            }}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除组件确认 */}
      <Dialog open={!!confirmDeleteComp} onOpenChange={(o) => { if (!o) setConfirmDeleteComp(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除组件？</DialogTitle>
            <DialogDescription>删除后关联的追溯链接也将被同步删除。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteComp(null)}>取消</Button>
            <Button variant="destructive" onClick={async () => {
              if (!confirmDeleteComp) return;
              await deleteManagedComponent(projectId, solution.id, confirmDeleteComp);
              await fetchManagedComponents(projectId, solution.id);
              setConfirmDeleteComp(null);
            }}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─────────────────────────── 主页面 ───────────────────────────

export default function ArchitecturesPage() {
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get("projectId");

  const { projects, fetchProjects } = useProjectStore();
  const { solutions, isRecommending, fetchSolutions, recommendArchitecture, autoMapTraceability } = useArchitectureStore();

  const [selectedProjectId, setSelectedProjectId] = useState(projectIdFromUrl || "");
  const [selectedAttributes, setSelectedAttributes] = useState<string[]>([]);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [isMappingTraceability, setIsMappingTraceability] = useState(false);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { if (projectIdFromUrl) setSelectedProjectId(projectIdFromUrl); }, [projectIdFromUrl]);
  useEffect(() => { if (selectedProjectId) fetchSolutions(selectedProjectId); }, [selectedProjectId, fetchSolutions]);

  const handleRecommend = async () => {
    if (!selectedProjectId) return;
    await recommendArchitecture(selectedProjectId, {
      quality_attributes: selectedAttributes.length > 0 ? selectedAttributes : undefined,
    });
    setRecommendOpen(false);
    setSelectedAttributes([]);
  };

  const handleAutoMap = async () => {
    if (!selectedProjectId) return;
    setIsMappingTraceability(true);
    try {
      await autoMapTraceability(selectedProjectId);
    } finally {
      setIsMappingTraceability(false);
    }
  };

  const toggleAttr = (attr: string) =>
    setSelectedAttributes((prev) => prev.includes(attr) ? prev.filter((a) => a !== attr) : [...prev, attr]);

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="架构设计" />
      <main className="flex-1 overflow-auto p-6 space-y-6">

        {/* 项目选择 + 操作栏 */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Label className="whitespace-nowrap shrink-0">选择项目</Label>
            <Select value={selectedProjectId} onValueChange={(v) => setSelectedProjectId(v ?? "")}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="请选择项目">
                  {selectedProjectId
                    ? projects.find((p) => p.id === selectedProjectId)?.name ?? selectedProjectId
                    : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedProjectId && (
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={() => setRecommendOpen(true)} disabled={isRecommending}>
                <BrainCircuit className="mr-1.5 h-4 w-4" />
                {isRecommending ? "推荐中..." : "AI 架构推荐"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleAutoMap} disabled={isMappingTraceability}>
                <GitBranch className="mr-1.5 h-4 w-4" />
                {isMappingTraceability ? "映射中..." : "AI 追溯映射"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => fetchSolutions(selectedProjectId)}>
                <RefreshCw className="mr-1.5 h-4 w-4" />刷新
              </Button>
            </div>
          )}
        </div>

        {/* 推荐进度提示 */}
        {isRecommending && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-4 flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm">AI 正在基于 ADD 方法分析需求并推荐架构方案，请稍候...</span>
            </CardContent>
          </Card>
        )}

        {/* 统计概览 */}
        {selectedProjectId && solutions.length > 0 && (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card><CardContent className="py-3">
              <p className="text-xs text-muted-foreground">方案总数</p>
              <p className="text-2xl font-bold">{solutions.length}</p>
            </CardContent></Card>
            <Card><CardContent className="py-3">
              <p className="text-xs text-muted-foreground">已确认</p>
              <p className="text-2xl font-bold text-green-600">{solutions.filter(s => s.status === "confirmed").length}</p>
            </CardContent></Card>
            <Card><CardContent className="py-3">
              <p className="text-xs text-muted-foreground">待评审</p>
              <p className="text-2xl font-bold text-yellow-600">{solutions.filter(s => s.status === "proposed").length}</p>
            </CardContent></Card>
            <Card><CardContent className="py-3">
              <p className="text-xs text-muted-foreground">已评审</p>
              <p className="text-2xl font-bold text-blue-600">{solutions.filter(s => ["selected", "reviewed"].includes(s.status)).length}</p>
            </CardContent></Card>
          </div>
        )}

        {/* 方案列表 */}
        {!selectedProjectId ? (
          <Card>
            <CardContent className="py-12 text-center">
              <LayoutDashboard className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">请选择项目</h3>
              <p className="text-muted-foreground">选择一个项目以查看和管理架构方案</p>
            </CardContent>
          </Card>
        ) : solutions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BrainCircuit className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">暂无架构方案</h3>
              <p className="text-muted-foreground mb-4">使用 AI 架构推荐功能自动生成架构方案</p>
              <Button onClick={() => setRecommendOpen(true)}>
                <BrainCircuit className="mr-2 h-4 w-4" />AI 架构推荐
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {solutions.map((sol) => (
              <ArchitectureDetailCard key={sol.id} solution={sol} projectId={selectedProjectId} />
            ))}
          </div>
        )}
      </main>

      {/* AI 推荐 Dialog */}
      <Dialog open={recommendOpen} onOpenChange={setRecommendOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>AI 架构推荐</DialogTitle>
            <DialogDescription>
              选择关注的质量属性，AI 将基于 ADD 方法为您推荐合适的架构方案
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="mb-3 block">关注的质量属性（可多选）</Label>
              <div className="flex flex-wrap gap-2">
                {QUALITY_ATTRIBUTES.map((attr) => (
                  <Badge key={attr} variant={selectedAttributes.includes(attr) ? "default" : "outline"}
                    className="cursor-pointer select-none" onClick={() => toggleAttr(attr)}>
                    {attr}
                  </Badge>
                ))}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">不选择则使用默认质量属性进行推荐</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecommendOpen(false)}>取消</Button>
            <Button onClick={handleRecommend} disabled={isRecommending}>
              {isRecommending ? "推荐中..." : "开始推荐"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
