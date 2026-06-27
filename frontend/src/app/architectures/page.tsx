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
  useProjectStore,
  useArchitectureStore,
} from "@/lib/project-store";

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
  const { createReview, createADR, fetchSolution, generateArchDoc, generatePlantuml, isGeneratingDoc, isGeneratingPlantuml } = useArchitectureStore();
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isADROpen, setIsADROpen] = useState(false);
  const [reviewData, setReviewData] = useState({ comment: "", rating: 3 });
  const [adrData, setADRData] = useState({
    title: "",
    context: "",
    decision: "",
    consequences: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localArchDoc, setLocalArchDoc] = useState<string | null>(null);
  const [localPlantuml, setLocalPlantuml] = useState<string | null>(null);

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
    components?: Array<{
      name: string;
      type: string;
      description: string;
      technology?: string;
    }>;
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
    } catch {
      // 静默处理
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleADR = async () => {
    setIsSubmitting(true);
    try {
      await createADR(projectId, solution.id, adrData);
      setIsADROpen(false);
      setADRData({ title: "", context: "", decision: "", consequences: "" });
      await fetchSolution(projectId, solution.id);
    } catch {
      // 静默处理
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-base">{solution.name}</CardTitle>
              {solution.pattern && (
                <Badge variant="outline">{solution.pattern}</Badge>
              )}
              <Badge variant="secondary">v{solution.version}</Badge>
            </div>
            <CardDescription>{solution.description || "AI 推荐的架构方案"}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <Separator />

          {/* 质量评分 */}
          {qualityScores && (
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-1">
                <Star className="h-4 w-4 text-yellow-500" />
                质量属性评分
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

          {/* AI 推荐详情 */}
          {recommendation && (
            <>
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <LayoutDashboard className="h-4 w-4 text-primary" />
                  架构模式
                </h4>
                <p className="text-sm bg-muted rounded-md p-3">
                  {recommendation.pattern || "未指定"}
                </p>
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
                          {comp.technology && (
                            <Badge variant="secondary" className="text-xs">{comp.technology}</Badge>
                          )}
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
                  <p className="text-sm text-muted-foreground bg-muted rounded-md p-3">
                    {recommendation.rationale}
                  </p>
                </div>
              )}

              {recommendation.trade_offs && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">权衡分析</h4>
                  <p className="text-sm text-muted-foreground bg-muted rounded-md p-3">
                    {recommendation.trade_offs}
                  </p>
                </div>
              )}
            </>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateDoc}
              disabled={isGeneratingDoc}
            >
              <FileText className="mr-2 h-4 w-4" />
              {isGeneratingDoc ? "生成中..." : "生成架构文档"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleGeneratePlantuml}
              disabled={isGeneratingPlantuml}
            >
              <Code2 className="mr-2 h-4 w-4" />
              {isGeneratingPlantuml ? "生成中..." : "生成 PlantUML"}
            </Button>
            <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
              <DialogTrigger render={<Button size="sm" variant="outline" />}>
                <MessageSquare className="mr-2 h-4 w-4" />
                架构评审
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>架构评审</DialogTitle>
                  <DialogDescription>对该架构方案进行评审</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>评分</Label>
                    <Select
                      value={String(reviewData.rating)}
                      onValueChange={(v) =>
                        setReviewData((prev) => ({ ...prev, rating: Number(v) }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
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
                    <Textarea
                      placeholder="请输入评审意见"
                      value={reviewData.comment}
                      onChange={(e) =>
                        setReviewData((prev) => ({ ...prev, comment: e.target.value }))
                      }
                      rows={4}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsReviewOpen(false)}>
                    取消
                  </Button>
                  <Button onClick={handleReview} disabled={isSubmitting}>
                    {isSubmitting ? "提交中..." : "提交评审"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isADROpen} onOpenChange={setIsADROpen}>
              <DialogTrigger render={<Button size="sm" variant="outline" />}>
                <FileCheck className="mr-2 h-4 w-4" />
                创建 ADR
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>创建架构决策记录 (ADR)</DialogTitle>
                  <DialogDescription>记录重要的架构决策及其背景</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>标题</Label>
                    <Input
                      placeholder="ADR 标题"
                      value={adrData.title}
                      onChange={(e) =>
                        setADRData((prev) => ({ ...prev, title: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>背景 (Context)</Label>
                    <Textarea
                      placeholder="描述决策的背景和驱动力"
                      value={adrData.context}
                      onChange={(e) =>
                        setADRData((prev) => ({ ...prev, context: e.target.value }))
                      }
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>决策 (Decision)</Label>
                    <Textarea
                      placeholder="描述做出的决策"
                      value={adrData.decision}
                      onChange={(e) =>
                        setADRData((prev) => ({ ...prev, decision: e.target.value }))
                      }
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>后果 (Consequences)</Label>
                    <Textarea
                      placeholder="描述决策带来的后果（选填）"
                      value={adrData.consequences}
                      onChange={(e) =>
                        setADRData((prev) => ({
                          ...prev,
                          consequences: e.target.value,
                        }))
                      }
                      rows={2}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsADROpen(false)}>
                    取消
                  </Button>
                  <Button onClick={handleADR} disabled={isSubmitting}>
                    {isSubmitting ? "创建中..." : "创建 ADR"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* 生成的架构文档 */}
          {localArchDoc && (
            <div className="space-y-2 pt-2" data-color-mode="light">
              <h4 className="text-sm font-semibold flex items-center gap-1">
                <FileText className="h-4 w-4 text-primary" />
                架构文档
              </h4>
              <div className="rounded-md border p-3 max-h-[400px] overflow-auto">
                <MDEditor.Markdown source={localArchDoc} />
              </div>
            </div>
          )}

          {/* 生成的 PlantUML 图 */}
          {localPlantuml && (
            <div className="space-y-2 pt-2">
              <h4 className="text-sm font-semibold flex items-center gap-1">
                <ImageIcon className="h-4 w-4 text-primary" />
                PlantUML 架构图
              </h4>
              <div className="rounded-md border p-3 bg-white">
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
        </CardContent>
      )}
    </Card>
  );
}

export default function ArchitecturesPage() {
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get("projectId");

  const { projects, fetchProjects } = useProjectStore();
  const {
    solutions,
    isRecommending,
    fetchSolutions,
    recommendArchitecture,
    autoMapTraceability,
  } = useArchitectureStore();

  const [selectedProjectId, setSelectedProjectId] = useState(
    projectIdFromUrl || ""
  );
  const [selectedAttributes, setSelectedAttributes] = useState<string[]>([]);
  const [isRecommendingOpen, setIsRecommendingOpen] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (projectIdFromUrl) {
      setSelectedProjectId(projectIdFromUrl);
    }
  }, [projectIdFromUrl]);

  useEffect(() => {
    if (selectedProjectId) {
      fetchSolutions(selectedProjectId);
    }
  }, [selectedProjectId, fetchSolutions]);

  const handleRecommend = async () => {
    if (!selectedProjectId) return;
    await recommendArchitecture(selectedProjectId, {
      quality_attributes: selectedAttributes.length > 0 ? selectedAttributes : undefined,
    });
    setIsRecommendingOpen(false);
  };

  const handleTraceability = async () => {
    if (!selectedProjectId) return;
    await autoMapTraceability(selectedProjectId);
  };

  const toggleAttribute = (attr: string) => {
    setSelectedAttributes((prev) =>
      prev.includes(attr) ? prev.filter((a) => a !== attr) : [...prev, attr]
    );
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="架构设计" />
      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* 项目选择 */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-1">
            <Label className="whitespace-nowrap">选择项目</Label>
            <Select
              value={selectedProjectId}
              onValueChange={(v) => setSelectedProjectId(v ?? "")}
            >
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="请选择项目" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedProjectId && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setIsRecommendingOpen(true)}
                disabled={isRecommending}
              >
                <BrainCircuit className="mr-2 h-4 w-4" />
                {isRecommending ? "推荐中..." : "AI 架构推荐"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleTraceability}>
                <GitBranch className="mr-2 h-4 w-4" />
                追溯映射
              </Button>
            </div>
          )}
        </div>

        {/* AI 推荐进度 */}
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

        {/* 质量属性选择 Dialog */}
        <Dialog open={isRecommendingOpen} onOpenChange={setIsRecommendingOpen}>
          <DialogContent>
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
                    <Badge
                      key={attr}
                      variant={selectedAttributes.includes(attr) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleAttribute(attr)}
                    >
                      {attr}
                    </Badge>
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                不选择则使用默认质量属性进行推荐
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRecommendingOpen(false)}>
                取消
              </Button>
              <Button onClick={handleRecommend} disabled={isRecommending}>
                开始推荐
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 架构方案列表 */}
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
              <p className="text-muted-foreground">
                使用 AI 架构推荐功能自动生成架构方案
              </p>
              <Button
                className="mt-4"
                onClick={() => setIsRecommendingOpen(true)}
              >
                <BrainCircuit className="mr-2 h-4 w-4" />
                AI 架构推荐
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {solutions.map((sol) => (
              <ArchitectureDetailCard
                key={sol.id}
                solution={sol}
                projectId={selectedProjectId}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
