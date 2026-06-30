// 架构设计与 AI 推荐页面

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BrainCircuit,
  LayoutDashboard,
  Plus,
  Star,
  MessageSquare,
  FileCheck,
  GitBranch,
  ChevronDown,
  ChevronUp,
  FileText,
  Code2,
  ImageIcon,
  Trash2,
  Edit,
  RefreshCw,
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
  DialogTrigger,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useProjectStore,
  useArchitectureStore,
} from "@/lib/project-store";
import { aiReviewAPI } from "@/lib/api";

// ADD 方法关注的质量属性
const QUALITY_ATTRIBUTES = [
  "性能", "可用性", "安全性", "可修改性", "可测试性",
  "易用性", "互操作性", "可靠性",
];

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
  const {
    createReview, createADR, fetchSolution, generateArchDoc, generatePlantuml,
    isGeneratingDoc, isGeneratingPlantuml,
    updateSolution, fetchReviews, updateReviewStatus, deleteReview,
    fetchADRs, updateADR, deleteADR,
    fetchManagedComponents, createManagedComponent, updateManagedComponent, deleteManagedComponent,
    reviews, adrs, managedComponents,
  } = useArchitectureStore();

  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isADROpen, setIsADROpen] = useState(false);
  const [reviewData, setReviewData] = useState({ comment: "", rating: 3 });
  const [adrData, setADRData] = useState({ title: "", context: "", decision: "", consequences: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localArchDoc, setLocalArchDoc] = useState<string | null>(null);
  const [localPlantuml, setLocalPlantuml] = useState<string | null>(null);
  const [isSolutionEditOpen, setIsSolutionEditOpen] = useState(false);
  const [solutionEditData, setSolutionEditData] = useState({ name: "", description: "", status: "", recommendation: "", quality_scores: "" });
  const [isADREditOpen, setIsADREditOpen] = useState(false);
  const [adrEditData, setADREditData] = useState({ id: "", title: "", context: "", decision: "", consequences: "", status: "" });
  const [isCompCreateOpen, setIsCompCreateOpen] = useState(false);
  const [isCompEditOpen, setIsCompEditOpen] = useState(false);
  const [compCreateData, setCompCreateData] = useState({ name: "", comp_type: "", responsibility: "", interfaces: "", dependencies: "" });
  const [compEditData, setCompEditData] = useState({ id: "", name: "", comp_type: "", responsibility: "", interfaces: "", dependencies: "" });
  const [activeTab, setActiveTab] = useState("overview");
  const [isAiReviewing, setIsAiReviewing] = useState(false);
  const [aiReviewResult, setAiReviewResult] = useState<any>(null);
  const [aiReviewError, setAiReviewError] = useState("");
  const [archStats, setArchStats] = useState<{ recommend_count: number; view_count: number; review_count: number } | null>(null);

  // 加载统计数据
  useEffect(() => {
    aiReviewAPI.getArchStats(projectId, solution.id)
      .then((res) => setArchStats(res.data))
      .catch(() => { /* 静默处理 */ });
  }, [projectId, solution.id]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === "reviews") fetchReviews(projectId, solution.id);
    else if (value === "adrs") fetchADRs(projectId, solution.id);
    else if (value === "components") fetchManagedComponents(projectId, solution.id);
  };

  const handleAiReview = async () => {
    setIsAiReviewing(true);
    setAiReviewError("");
    try {
      const res = await aiReviewAPI.aiArchReview(projectId, solution.id);
      setAiReviewResult(res.data);
      // 刷新评审列表
      await fetchReviews(projectId, solution.id);
    } catch (err: any) {
      setAiReviewError(err.response?.data?.detail || "AI评审失败，请稍后重试");
    } finally {
      setIsAiReviewing(false);
    }
  };

  const handleGenerateDoc = async () => {
    const result = await generateArchDoc(projectId, solution.id);
    if (result) setLocalArchDoc(result);
  };

  const handleGeneratePlantuml = async () => {
    const result = await generatePlantuml(projectId, solution.id);
    if (result) setLocalPlantuml(result);
  };

  const recommendation = solution.recommendation as {
    pattern?: string;
    components?: Array<{ name: string; type: string; description: string; technology?: string }>;
    rationale?: string;
    trade_offs?: string;
  } | null;

  const qualityScores = solution.quality_scores as Record<string, number> | null;

  const handleReview = async () => {
    setIsSubmitting(true);
    try {
      await createReview(projectId, solution.id, reviewData);
      setIsReviewOpen(false);
      setReviewData({ comment: "", rating: 3 });
      await fetchSolution(projectId, solution.id);
    } catch { /* 静默处理 */ } finally { setIsSubmitting(false); }
  };

  const handleADR = async () => {
    setIsSubmitting(true);
    try {
      await createADR(projectId, solution.id, adrData);
      setIsADROpen(false);
      setADRData({ title: "", context: "", decision: "", consequences: "" });
      await fetchSolution(projectId, solution.id);
    } catch { /* 静默处理 */ } finally { setIsSubmitting(false); }
  };

  const handleUpdateSolution = async () => {
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: solutionEditData.name,
        description: solutionEditData.description,
        status: solutionEditData.status,
      };
      if (solutionEditData.recommendation.trim()) {
        try { payload.recommendation = JSON.parse(solutionEditData.recommendation); } catch { /* 忽略 */ }
      }
      if (solutionEditData.quality_scores.trim()) {
        try { payload.quality_scores = JSON.parse(solutionEditData.quality_scores); } catch { /* 忽略 */ }
      }
      await updateSolution(projectId, solution.id, payload);
      setIsSolutionEditOpen(false);
      await fetchSolution(projectId, solution.id);
    } catch { /* 静默处理 */ } finally { setIsSubmitting(false); }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!confirm("确认删除该评审？")) return;
    try { await deleteReview(projectId, solution.id, reviewId); } catch { /* 静默处理 */ }
  };

  const handleReviewStatusChange = async (reviewId: string, status: string) => {
    try { await updateReviewStatus(projectId, solution.id, reviewId, { status }); } catch { /* 静默处理 */ }
  };

  const handleEditADR = (adr: any) => {
    setADREditData({ id: adr.id, title: adr.title || "", context: adr.context || "", decision: adr.decision || "", consequences: adr.consequences || "", status: adr.status || "proposed" });
    setIsADREditOpen(true);
  };

  const handleUpdateADR = async () => {
    setIsSubmitting(true);
    try {
      const { id, ...data } = adrEditData;
      await updateADR(projectId, solution.id, id, data);
      setIsADREditOpen(false);
    } catch { /* 静默处理 */ } finally { setIsSubmitting(false); }
  };

  const handleDeleteADR = async (adrId: string) => {
    if (!confirm("确认删除该 ADR？")) return;
    try { await deleteADR(projectId, solution.id, adrId); } catch { /* 静默处理 */ }
  };

  const handleCreateComponent = async () => {
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: compCreateData.name,
        comp_type: compCreateData.comp_type || undefined,
        responsibility: compCreateData.responsibility || undefined,
      };
      if (compCreateData.interfaces.trim()) {
        try { payload.interfaces = JSON.parse(compCreateData.interfaces); } catch { /* 忽略 */ }
      }
      if (compCreateData.dependencies.trim()) {
        try { payload.dependencies = JSON.parse(compCreateData.dependencies); } catch { /* 忽略 */ }
      }
      await createManagedComponent(projectId, solution.id, payload);
      setIsCompCreateOpen(false);
      setCompCreateData({ name: "", comp_type: "", responsibility: "", interfaces: "", dependencies: "" });
    } catch { /* 静默处理 */ } finally { setIsSubmitting(false); }
  };

  const handleEditComponent = (comp: any) => {
    setCompEditData({ id: comp.id, name: comp.name || "", comp_type: comp.comp_type || "", responsibility: comp.responsibility || "", interfaces: comp.interfaces || "", dependencies: comp.dependencies || "" });
    setIsCompEditOpen(true);
  };

  const handleUpdateComponent = async () => {
    setIsSubmitting(true);
    try {
      const { id } = compEditData;
      const payload: Record<string, unknown> = {
        name: compEditData.name,
        comp_type: compEditData.comp_type || undefined,
        responsibility: compEditData.responsibility || undefined,
      };
      if (compEditData.interfaces.trim()) {
        try { payload.interfaces = JSON.parse(compEditData.interfaces); } catch { /* 忽略 */ }
      }
      if (compEditData.dependencies.trim()) {
        try { payload.dependencies = JSON.parse(compEditData.dependencies); } catch { /* 忽略 */ }
      }
      await updateManagedComponent(projectId, solution.id, id, payload);
      setIsCompEditOpen(false);
    } catch { /* 静默处理 */ } finally { setIsSubmitting(false); }
  };

  const handleDeleteComponent = async (componentId: string) => {
    if (!confirm("确认删除该组件？")) return;
    try { await deleteManagedComponent(projectId, solution.id, componentId); } catch { /* 静默处理 */ }
  };

  const openSolutionEdit = () => {
    setSolutionEditData({
      name: solution.name,
      description: solution.description || "",
      status: solution.status,
      recommendation: solution.recommendation ? JSON.stringify(solution.recommendation, null, 2) : "",
      quality_scores: solution.quality_scores ? JSON.stringify(solution.quality_scores, null, 2) : "",
    });
    setIsSolutionEditOpen(true);
  };

  const reviewStatusBadge = (status: string) => {
    if (status === "resolved") return <Badge className="bg-green-100 text-green-800">resolved</Badge>;
    if (status === "addressed") return <Badge className="bg-blue-100 text-blue-800">addressed</Badge>;
    return <Badge variant="secondary">{status || "open"}</Badge>;
  };

  const adrStatusBadge = (status: string) => {
    if (status === "accepted") return <Badge className="bg-green-100 text-green-800">accepted</Badge>;
    if (status === "deprecated") return <Badge className="bg-red-100 text-red-800">deprecated</Badge>;
    if (status === "superseded") return <Badge className="bg-yellow-100 text-yellow-800">superseded</Badge>;
    return <Badge variant="secondary">{status || "proposed"}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <CardTitle className="text-base">{solution.name}</CardTitle>
              {solution.pattern && <Badge variant="outline">{solution.pattern}</Badge>}
              <Badge variant="secondary">v{solution.version}</Badge>
              {archStats && (
                <>
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-300">👍 {archStats.recommend_count}</Badge>
                  <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-300">👁 {archStats.view_count}</Badge>
                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-300">📝 {archStats.review_count}</Badge>
                </>
              )}
            </div>
            <CardDescription>{solution.description || "AI 推荐的架构方案"}</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={openSolutionEdit}>
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <Separator />
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="overview">概览</TabsTrigger>
              <TabsTrigger value="reviews">评审管理</TabsTrigger>
              <TabsTrigger value="adrs">ADR 管理</TabsTrigger>
              <TabsTrigger value="components">组件管理</TabsTrigger>
            </TabsList>
            {/* Tab 1 - 概览 */}
            <TabsContent value="overview" className="space-y-4">
              {qualityScores && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-1">
                    <Star className="h-4 w-4 text-yellow-500" />质量属性评分
                  </h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    {Object.entries(qualityScores).map(([key, val]) => (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">{key}</span>
                          <span className="text-sm text-muted-foreground">{val}/100</span>
                        </div>
                        <Progress value={val} className="h-2" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {recommendation && (
                <>
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                      <LayoutDashboard className="h-4 w-4 text-primary" />架构模式
                    </h4>
                    <p className="text-sm bg-muted rounded-md p-3">{recommendation.pattern || "未指定"}</p>
                  </div>
                  {recommendation.components && recommendation.components.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">组件列表</h4>
                      <div className="space-y-2">
                        {recommendation.components.map((comp, i) => (
                          <div key={i} className="rounded-md border p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">{comp.name}</span>
                              <Badge variant="outline" className="text-xs">{comp.type}</Badge>
                              {comp.technology && <Badge variant="secondary" className="text-xs">{comp.technology}</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">{comp.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {recommendation.rationale && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">设计依据</h4>
                      <p className="text-sm text-muted-foreground bg-muted rounded-md p-3">{recommendation.rationale}</p>
                    </div>
                  )}
                  {recommendation.trade_offs && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">权衡分析</h4>
                      <p className="text-sm text-muted-foreground bg-muted rounded-md p-3">{recommendation.trade_offs}</p>
                    </div>
                  )}
                </>
              )}
              <div className="flex gap-2 pt-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={handleGenerateDoc} disabled={isGeneratingDoc}>
                  <FileText className="mr-2 h-4 w-4" />{isGeneratingDoc ? "生成中..." : "生成架构文档"}
                </Button>
                <Button size="sm" variant="outline" onClick={handleGeneratePlantuml} disabled={isGeneratingPlantuml}>
                  <Code2 className="mr-2 h-4 w-4" />{isGeneratingPlantuml ? "生成中..." : "生成 PlantUML"}
                </Button>
                <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
                  <DialogTrigger render={<Button size="sm" variant="outline" />}>
                    <MessageSquare className="mr-2 h-4 w-4" />架构评审
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>架构评审</DialogTitle>
                      <DialogDescription>对该架构方案进行评审</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>评分</Label>
                        <Select value={String(reviewData.rating)} onValueChange={(v) => setReviewData((prev) => ({ ...prev, rating: Number(v) }))}>
                          <SelectTrigger>
                            <SelectValue>{reviewData.rating ? `${reviewData.rating} - ${["", "很差", "较差", "一般", "较好", "很好"][reviewData.rating]}` : undefined}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 - 很差</SelectItem>
                            <SelectItem value="2">2 - 较差</SelectItem>
                            <SelectItem value="3">3 - 一般</SelectItem>
                            <SelectItem value="4">4 - 较好</SelectItem>
                            <SelectItem value="5">5 - 很好</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>评审意见</Label>
                        <Textarea placeholder="请输入评审意见" value={reviewData.comment} onChange={(e) => setReviewData((prev) => ({ ...prev, comment: e.target.value }))} rows={4} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsReviewOpen(false)}>取消</Button>
                      <Button onClick={handleReview} disabled={isSubmitting}>{isSubmitting ? "提交中..." : "提交评审"}</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Dialog open={isADROpen} onOpenChange={setIsADROpen}>
                  <DialogTrigger render={<Button size="sm" variant="outline" />}>
                    <FileCheck className="mr-2 h-4 w-4" />创建 ADR
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>创建架构决策记录 (ADR)</DialogTitle>
                      <DialogDescription>记录重要的架构决策及其背景</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>标题</Label>
                        <Input placeholder="ADR 标题" value={adrData.title} onChange={(e) => setADRData((prev) => ({ ...prev, title: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>背景 (Context)</Label>
                        <Textarea placeholder="描述决策的背景和驱动力" value={adrData.context} onChange={(e) => setADRData((prev) => ({ ...prev, context: e.target.value }))} rows={3} />
                      </div>
                      <div className="space-y-2">
                        <Label>决策 (Decision)</Label>
                        <Textarea placeholder="描述做出的决策" value={adrData.decision} onChange={(e) => setADRData((prev) => ({ ...prev, decision: e.target.value }))} rows={3} />
                      </div>
                      <div className="space-y-2">
                        <Label>后果 (Consequences)</Label>
                        <Textarea placeholder="描述决策带来的后果（选填）" value={adrData.consequences} onChange={(e) => setADRData((prev) => ({ ...prev, consequences: e.target.value }))} rows={2} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsADROpen(false)}>取消</Button>
                      <Button onClick={handleADR} disabled={isSubmitting}>{isSubmitting ? "创建中..." : "创建 ADR"}</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              {localArchDoc && (
                <div className="space-y-2 pt-2" data-color-mode="light">
                  <h4 className="text-sm font-semibold flex items-center gap-1"><FileText className="h-4 w-4 text-primary" />架构文档</h4>
                  <div className="rounded-md border p-3 max-h-[400px] overflow-auto"><MDEditor.Markdown source={localArchDoc} /></div>
                </div>
              )}
              {localPlantuml && (
                <div className="space-y-2 pt-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1"><ImageIcon className="h-4 w-4 text-primary" />PlantUML 架构图</h4>
                  <div className="rounded-md border p-3 bg-white">
                    <img src={`http://www.plantuml.com/plantuml/img/${plantumlEncode(localPlantuml)}`} alt="Architecture Diagram" className="max-w-full" />
                  </div>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">查看 PlantUML 源码</summary>
                    <pre className="mt-2 p-3 bg-muted rounded-md overflow-auto whitespace-pre-wrap">{localPlantuml}</pre>
                  </details>
                </div>
              )}
            </TabsContent>
            {/* Tab 2 - 评审管理 */}
            <TabsContent value="reviews" className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">评审列表</h4>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="default" onClick={handleAiReview} disabled={isAiReviewing}>
                    {isAiReviewing ? (
                      <><span className="mr-2 h-4 w-4 inline-block animate-spin rounded-full border-2 border-white border-t-transparent" />AI评审中...</>
                    ) : (
                      <>🤖 AI智能评审</>
                    )}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => fetchReviews(projectId, solution.id)}><RefreshCw className="h-4 w-4" /></Button>
                </div>
              </div>
              {aiReviewError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{aiReviewError}</div>
              )}
              {aiReviewResult && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-semibold flex items-center gap-2">🤖 AI 评审结果</h5>
                    {aiReviewResult.overall_rating != null && (
                      <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">
                        ⭐ {aiReviewResult.overall_rating}/10
                      </Badge>
                    )}
                  </div>
                  {aiReviewResult.summary && (
                    <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
                      <p className="text-sm font-medium text-blue-800">{aiReviewResult.summary}</p>
                    </div>
                  )}
                  {aiReviewResult.quality_assessment && (
                    <div>
                      <p className="text-xs font-semibold mb-2 text-muted-foreground">五维度质量评估</p>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {Object.entries(aiReviewResult.quality_assessment as Record<string, any>).map(([key, val]) => (
                          <div key={key} className="rounded-md border p-2 text-center">
                            <p className="text-xs text-muted-foreground">{key}</p>
                            <p className="text-sm font-semibold">{typeof val === 'object' ? (val as any)?.score ?? JSON.stringify(val) : String(val)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {aiReviewResult.defects && (aiReviewResult.defects as any[]).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-1 text-red-700">缺陷列表</p>
                      <ul className="space-y-1">
                        {(aiReviewResult.defects as any[]).map((d: any, i: number) => (
                          <li key={i} className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                            {typeof d === 'string' ? d : d.description || JSON.stringify(d)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiReviewResult.suggestions && (aiReviewResult.suggestions as any[]).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-1 text-blue-700">改进建议</p>
                      <ul className="space-y-1">
                        {(aiReviewResult.suggestions as any[]).map((s: any, i: number) => (
                          <li key={i} className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded p-2">
                            {typeof s === 'string' ? s : s.description || JSON.stringify(s)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {reviews.length === 0 && !aiReviewResult ? (
                <p className="text-sm text-muted-foreground text-center py-6">暂无评审记录</p>
              ) : reviews.length > 0 ? (
                <Table>
                  <TableHeader><TableRow><TableHead>评审内容</TableHead><TableHead>评分</TableHead><TableHead>状态</TableHead><TableHead>来源</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {reviews.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="max-w-[200px] truncate">{r.comment}</TableCell>
                        <TableCell>{r.rating}/5</TableCell>
                        <TableCell>
                          <Select value={r.status || "open"} onValueChange={(v) => handleReviewStatusChange(r.id, v)}>
                            <SelectTrigger className="w-[130px] h-8"><SelectValue>{reviewStatusBadge(r.status || "open")}</SelectValue></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">open</SelectItem>
                              <SelectItem value="addressed">addressed</SelectItem>
                              <SelectItem value="resolved">resolved</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {r.reviewer_id === "ai" || r.comment?.startsWith("[AI") ? (
                            <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-xs">AI</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">人工</Badge>
                          )}
                        </TableCell>
                        <TableCell><Button size="sm" variant="ghost" onClick={() => handleDeleteReview(r.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </TabsContent>
            {/* Tab 3 - ADR 管理 */}
            <TabsContent value="adrs" className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">ADR 列表</h4>
                <Button size="sm" variant="ghost" onClick={() => fetchADRs(projectId, solution.id)}><RefreshCw className="h-4 w-4" /></Button>
              </div>
              {adrs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">暂无 ADR 记录</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>标题</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {adrs.map((adr: any) => (
                      <TableRow key={adr.id}>
                        <TableCell>{adr.title}</TableCell>
                        <TableCell>{adrStatusBadge(adr.status || "proposed")}</TableCell>
                        <TableCell className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleEditADR(adr)}><Edit className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteADR(adr.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
            {/* Tab 4 - 组件管理 */}
            <TabsContent value="components" className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">组件列表</h4>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => fetchManagedComponents(projectId, solution.id)}><RefreshCw className="h-4 w-4" /></Button>
                  <Button size="sm" onClick={() => setIsCompCreateOpen(true)}><Plus className="mr-1 h-4 w-4" />新建组件</Button>
                </div>
              </div>
              {managedComponents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">暂无组件记录</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>名称</TableHead><TableHead>类型</TableHead><TableHead>职责</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {managedComponents.map((comp: any) => (
                      <TableRow key={comp.id}>
                        <TableCell>{comp.name}</TableCell>
                        <TableCell><Badge variant="outline">{comp.comp_type}</Badge></TableCell>
                        <TableCell className="max-w-[200px] truncate">{comp.responsibility}</TableCell>
                        <TableCell className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleEditComponent(comp)}><Edit className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteComponent(comp.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
      {/* Solution 编辑 Dialog */}
      <Dialog open={isSolutionEditOpen} onOpenChange={setIsSolutionEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑方案</DialogTitle><DialogDescription>修改架构方案信息</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>方案名称</Label><Input value={solutionEditData.name} onChange={(e) => setSolutionEditData((prev) => ({ ...prev, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>描述</Label><Textarea value={solutionEditData.description} onChange={(e) => setSolutionEditData((prev) => ({ ...prev, description: e.target.value }))} rows={3} /></div>
            <div className="space-y-2">
              <Label>状态</Label>
              <Select value={solutionEditData.status} onValueChange={(v) => { if (v) setSolutionEditData((prev) => ({ ...prev, status: v })); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="proposed">proposed</SelectItem>
                  <SelectItem value="selected">selected</SelectItem>
                  <SelectItem value="reviewed">reviewed</SelectItem>
                  <SelectItem value="confirmed">confirmed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>推荐结果（JSON）</Label><Textarea value={solutionEditData.recommendation} onChange={(e) => setSolutionEditData((prev) => ({ ...prev, recommendation: e.target.value }))} rows={4} placeholder='{"pattern": "...", "components": [...]}' /></div>
            <div className="space-y-2"><Label>质量评分（JSON）</Label><Textarea value={solutionEditData.quality_scores} onChange={(e) => setSolutionEditData((prev) => ({ ...prev, quality_scores: e.target.value }))} rows={4} placeholder='{"性能": 80, "安全性": 90}' /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSolutionEditOpen(false)}>取消</Button>
            <Button onClick={handleUpdateSolution} disabled={isSubmitting}>{isSubmitting ? "保存中..." : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ADR 编辑 Dialog */}
      <Dialog open={isADREditOpen} onOpenChange={setIsADREditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑 ADR</DialogTitle><DialogDescription>修改架构决策记录</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>标题</Label><Input value={adrEditData.title} onChange={(e) => setADREditData((prev) => ({ ...prev, title: e.target.value }))} /></div>
            <div className="space-y-2"><Label>背景 (Context)</Label><Textarea value={adrEditData.context} onChange={(e) => setADREditData((prev) => ({ ...prev, context: e.target.value }))} rows={3} /></div>
            <div className="space-y-2"><Label>决策 (Decision)</Label><Textarea value={adrEditData.decision} onChange={(e) => setADREditData((prev) => ({ ...prev, decision: e.target.value }))} rows={3} /></div>
            <div className="space-y-2"><Label>后果 (Consequences)</Label><Textarea value={adrEditData.consequences} onChange={(e) => setADREditData((prev) => ({ ...prev, consequences: e.target.value }))} rows={2} /></div>
            <div className="space-y-2">
              <Label>状态</Label>
              <Select value={adrEditData.status} onValueChange={(v) => { if (v) setADREditData((prev) => ({ ...prev, status: v })); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="proposed">proposed</SelectItem>
                  <SelectItem value="accepted">accepted</SelectItem>
                  <SelectItem value="deprecated">deprecated</SelectItem>
                  <SelectItem value="superseded">superseded</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsADREditOpen(false)}>取消</Button>
            <Button onClick={handleUpdateADR} disabled={isSubmitting}>{isSubmitting ? "保存中..." : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* 组件创建 Dialog */}
      <Dialog open={isCompCreateOpen} onOpenChange={setIsCompCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>新建组件</DialogTitle><DialogDescription>添加新的架构组件</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>名称</Label><Input value={compCreateData.name} onChange={(e) => setCompCreateData((prev) => ({ ...prev, name: e.target.value }))} placeholder="组件名称" /></div>
            <div className="space-y-2"><Label>类型</Label><Input value={compCreateData.comp_type} onChange={(e) => setCompCreateData((prev) => ({ ...prev, comp_type: e.target.value }))} placeholder="如: service, module, layer" /></div>
            <div className="space-y-2"><Label>职责</Label><Textarea value={compCreateData.responsibility} onChange={(e) => setCompCreateData((prev) => ({ ...prev, responsibility: e.target.value }))} rows={2} placeholder="组件职责描述" /></div>
            <div className="space-y-2"><Label>接口</Label><Textarea value={compCreateData.interfaces} onChange={(e) => setCompCreateData((prev) => ({ ...prev, interfaces: e.target.value }))} rows={2} placeholder="提供的接口（选填）" /></div>
            <div className="space-y-2"><Label>依赖</Label><Textarea value={compCreateData.dependencies} onChange={(e) => setCompCreateData((prev) => ({ ...prev, dependencies: e.target.value }))} rows={2} placeholder="依赖的其他组件（选填）" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCompCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreateComponent} disabled={isSubmitting}>{isSubmitting ? "创建中..." : "创建"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* 组件编辑 Dialog */}
      <Dialog open={isCompEditOpen} onOpenChange={setIsCompEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑组件</DialogTitle><DialogDescription>修改组件信息</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>名称</Label><Input value={compEditData.name} onChange={(e) => setCompEditData((prev) => ({ ...prev, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>类型</Label><Input value={compEditData.comp_type} onChange={(e) => setCompEditData((prev) => ({ ...prev, comp_type: e.target.value }))} /></div>
            <div className="space-y-2"><Label>职责</Label><Textarea value={compEditData.responsibility} onChange={(e) => setCompEditData((prev) => ({ ...prev, responsibility: e.target.value }))} rows={2} /></div>
            <div className="space-y-2"><Label>接口</Label><Textarea value={compEditData.interfaces} onChange={(e) => setCompEditData((prev) => ({ ...prev, interfaces: e.target.value }))} rows={2} /></div>
            <div className="space-y-2"><Label>依赖</Label><Textarea value={compEditData.dependencies} onChange={(e) => setCompEditData((prev) => ({ ...prev, dependencies: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCompEditOpen(false)}>取消</Button>
            <Button onClick={handleUpdateComponent} disabled={isSubmitting}>{isSubmitting ? "保存中..." : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function ArchitecturesPage() {
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get("projectId");
  const { projects, fetchProjects } = useProjectStore();
  const { solutions, isRecommending, fetchSolutions, recommendArchitecture, autoMapTraceability } = useArchitectureStore();
  const [selectedProjectId, setSelectedProjectId] = useState(projectIdFromUrl || "");
  const [selectedAttributes, setSelectedAttributes] = useState<string[]>([]);
  const [isRecommendingOpen, setIsRecommendingOpen] = useState(false);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { if (projectIdFromUrl) setSelectedProjectId(projectIdFromUrl); }, [projectIdFromUrl]);
  useEffect(() => { if (selectedProjectId) fetchSolutions(selectedProjectId); }, [selectedProjectId, fetchSolutions]);

  const handleRecommend = async () => {
    if (!selectedProjectId) return;
    await recommendArchitecture(selectedProjectId, { quality_attributes: selectedAttributes.length > 0 ? selectedAttributes : undefined });
    setIsRecommendingOpen(false);
  };

  const handleTraceability = async () => {
    if (!selectedProjectId) return;
    await autoMapTraceability(selectedProjectId);
  };

  const toggleAttribute = (attr: string) => {
    setSelectedAttributes((prev) => prev.includes(attr) ? prev.filter((a) => a !== attr) : [...prev, attr]);
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="架构设计" />
      <main className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-1">
            <Label className="whitespace-nowrap">选择项目</Label>
            <Select value={selectedProjectId} onValueChange={(v) => setSelectedProjectId(v ?? "")}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="请选择项目">{selectedProjectId ? projects.find((p) => p.id === selectedProjectId)?.name ?? selectedProjectId : undefined}</SelectValue>
              </SelectTrigger>
              <SelectContent>{projects.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          {selectedProjectId && (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setIsRecommendingOpen(true)} disabled={isRecommending}>
                <BrainCircuit className="mr-2 h-4 w-4" />{isRecommending ? "推荐中..." : "AI 架构推荐"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleTraceability}>
                <GitBranch className="mr-2 h-4 w-4" />追溯映射
              </Button>
            </div>
          )}
        </div>
        {isRecommending && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm">AI 正在基于 ADD 方法推荐架构方案...</span>
              </div>
            </CardContent>
          </Card>
        )}
        <Dialog open={isRecommendingOpen} onOpenChange={setIsRecommendingOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>AI 架构推荐</DialogTitle>
              <DialogDescription>选择关注的质量属性，AI 将基于 ADD 方法为您推荐合适的架构方案</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label className="mb-3 block">关注的质量属性（可多选）</Label>
                <div className="flex flex-wrap gap-2">
                  {QUALITY_ATTRIBUTES.map((attr) => (
                    <Badge key={attr} variant={selectedAttributes.includes(attr) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleAttribute(attr)}>{attr}</Badge>
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">不选择则使用默认质量属性进行推荐</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRecommendingOpen(false)}>取消</Button>
              <Button onClick={handleRecommend} disabled={isRecommending}>开始推荐</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
              <LayoutDashboard className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">暂无架构方案</h3>
              <p className="text-muted-foreground">使用 AI 架构推荐功能自动生成架构方案</p>
              <Button className="mt-4" onClick={() => setIsRecommendingOpen(true)}>
                <BrainCircuit className="mr-2 h-4 w-4" />AI 架构推荐
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {solutions.map((sol) => (<ArchitectureDetailCard key={sol.id} solution={sol} projectId={selectedProjectId} />))}
          </div>
        )}
      </main>
    </div>
  );
}
