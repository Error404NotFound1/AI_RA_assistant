// 需求分析与 AI 质量评估页面

"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  BrainCircuit,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useProjectStore,
  useRequirementStore,
} from "@/lib/project-store";

// INCOSE 七大质量属性
const INCOSE_ATTRIBUTES = [
  { key: "completeness", label: "完整性", description: "需求是否包含所有必要信息" },
  { key: "consistency", label: "一致性", description: "需求是否与其他需求矛盾" },
  { key: "verifiability", label: "可验证性", description: "需求是否可被验证和测试" },
  { key: "unambiguity", label: "无歧义性", description: "需求是否只有一种解释" },
  { key: "traceability", label: "可追溯性", description: "需求是否可追溯到来源" },
  { key: "feasibility", label: "可行性", description: "需求是否可在约束内实现" },
  { key: "singularity", label: "单一性", description: "需求是否只描述一个功能" },
];

function QualityScoreBar({ label, score, description }: { label: string; score: number | string; description: string }) {
  const numericScore = typeof score === "number" ? score : parseInt(score) || 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">{numericScore}/100</span>
      </div>
      <Progress value={numericScore} className="h-2" />
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function AnalysisResultCard({
  requirement,
}: {
  requirement: {
    id: string;
    title: string;
    description: string;
    status: string;
    analysis_result: Record<string, unknown> | null;
    priority: string | null;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const analysis = requirement.analysis_result as {
    user_stories?: Array<{ role: string; goal: string; benefit: string }>;
    classification?: Record<string, string>;
    quality?: Record<string, number>;
    suggestions?: Record<string, string>;
  } | null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline">待分析</Badge>;
      case "analyzed":
        return <Badge variant="secondary">已分析</Badge>;
      case "confirmed":
        return <Badge className="bg-green-600">已确认</Badge>;
      case "needs_revision":
        return <Badge variant="destructive">需修改</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-base">{requirement.title}</CardTitle>
              {getStatusBadge(requirement.status)}
              {requirement.priority && (
                <Badge variant="outline" className="text-xs">
                  {requirement.priority}
                </Badge>
              )}
            </div>
            <CardDescription className="line-clamp-2">
              {requirement.description}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      {expanded && analysis && (
        <CardContent className="space-y-4">
          <Separator />
          {/* AI 分析结果 */}
          {analysis.user_stories && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                <Sparkles className="h-4 w-4 text-primary" />
                提取的用户故事
              </h4>
              <div className="space-y-2">
                {analysis.user_stories!.map(
                  (story, i) => (
                    <div
                      key={i}
                      className="rounded-md bg-muted p-3 text-sm"
                    >
                      <p>
                        作为 <strong>{story.role}</strong>，我希望
                        <strong> {story.goal}</strong>，以便
                        <strong> {story.benefit}</strong>
                      </p>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {analysis.classification && (
            <div>
              <h4 className="text-sm font-semibold mb-2">需求分类</h4>
              <div className="flex gap-2 flex-wrap">
                {analysis.classification &&
                  Object.entries(analysis.classification).map(([key, val]) => (
                    <Badge key={key} variant="secondary">
                      {key}: {String(val)}
                    </Badge>
                  ))}
              </div>
            </div>
          )}

          {analysis.quality && (
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                INCOSE 质量评估
              </h4>
              <div className="grid gap-3 md:grid-cols-2">
                {INCOSE_ATTRIBUTES.map((attr) => {
                  const val = analysis.quality?.[attr.key] ?? 0;
                  return (
                    <QualityScoreBar
                      key={attr.key}
                      label={attr.label}
                      score={typeof val === "number" ? val : 0}
                      description={attr.description}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {analysis.suggestions && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                改进建议
              </h4>
              <div className="space-y-1">
                {analysis.suggestions &&
                  Object.entries(analysis.suggestions).map(([key, val]) => (
                    <p key={key} className="text-sm text-muted-foreground">
                      - {key}: {String(val)}
                    </p>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function RequirementsPage() {
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get("projectId");

  const { projects, fetchProjects } = useProjectStore();
  const {
    requirements,
    isAnalyzing,
    analysisProgress,
    fetchRequirements,
    createRequirement,
    analyzeRequirements,
    confirmRequirement,
  } = useRequirementStore();

  const [selectedProjectId, setSelectedProjectId] = useState(
    projectIdFromUrl || ""
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newReq, setNewReq] = useState({
    title: "",
    description: "",
    source: "",
  });
  const [isCreating, setIsCreating] = useState(false);

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
      fetchRequirements(selectedProjectId);
    }
  }, [selectedProjectId, fetchRequirements]);

  const handleCreate = async () => {
    if (!selectedProjectId || !newReq.title.trim()) return;
    setIsCreating(true);
    try {
      await createRequirement(selectedProjectId, newReq);
      setIsCreateOpen(false);
      setNewReq({ title: "", description: "", source: "" });
    } catch {
      // 静默处理
    } finally {
      setIsCreating(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedProjectId) return;
    await analyzeRequirements(selectedProjectId);
  };

  const handleConfirm = async (reqId: string) => {
    if (!selectedProjectId) return;
    await confirmRequirement(selectedProjectId, reqId);
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="需求分析" />
      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* 项目选择和操作栏 */}
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
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger render={<Button size="sm" />}>
                  <Plus className="mr-2 h-4 w-4" />
                  添加需求
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>添加新需求</DialogTitle>
                    <DialogDescription>
                      输入需求信息，稍后可使用 AI 进行分析
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="req-title">需求标题</Label>
                      <Input
                        id="req-title"
                        placeholder="请输入需求标题"
                        value={newReq.title}
                        onChange={(e) =>
                          setNewReq((prev) => ({
                            ...prev,
                            title: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="req-desc">需求描述</Label>
                      <Textarea
                        id="req-desc"
                        placeholder="请详细描述需求内容"
                        value={newReq.description}
                        onChange={(e) =>
                          setNewReq((prev) => ({
                            ...prev,
                            description: e.target.value,
                          }))
                        }
                        rows={5}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="req-source">需求来源（选填）</Label>
                      <Input
                        id="req-source"
                        placeholder="如：客户访谈、需求规格说明书等"
                        value={newReq.source}
                        onChange={(e) =>
                          setNewReq((prev) => ({
                            ...prev,
                            source: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsCreateOpen(false)}
                    >
                      取消
                    </Button>
                    <Button onClick={handleCreate} disabled={isCreating}>
                      {isCreating ? "添加中..." : "添加"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button
                size="sm"
                variant="default"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
              >
                <BrainCircuit className="mr-2 h-4 w-4" />
                {isAnalyzing ? "分析中..." : "AI 分析"}
              </Button>
            </div>
          )}
        </div>

        {/* 分析进度 */}
        {isAnalyzing && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm">{analysisProgress || "AI 正在分析需求..."}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 需求列表 */}
        {!selectedProjectId ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">请选择项目</h3>
              <p className="text-muted-foreground">选择一个项目以查看和管理需求</p>
            </CardContent>
          </Card>
        ) : requirements.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">暂无需求</h3>
              <p className="text-muted-foreground">
                添加需求并使用 AI 进行智能分析
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {requirements.map((req) => (
              <div key={req.id} className="relative">
                <AnalysisResultCard requirement={req} />
                {req.status === "analyzed" && (
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleConfirm(req.id)}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      确认需求
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
