// 需求追溯矩阵视图

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  GitBranch,
  FileText,
  CheckCircle2,
  XCircle,
  LayoutGrid,
  Plus,
  Trash2,
  Edit,
  Link,
  Eye,
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  useProjectStore,
  useArchitectureStore,
  useRequirementStore,
} from "@/lib/project-store";
import { architectureAPI } from "@/lib/api";

interface TraceabilityUserStory {
  role: string;
  goal: string;
  benefit: string;
}

interface TraceabilityUseCase {
  title: string;
  actor: string;
}

interface TraceabilityArchLink {
  component_name: string;
  mapping_type: string;
  confidence: number;
}

interface TraceabilityRequirement {
  id: string;
  title: string;
  req_type: string | null;
  priority: string | null;
  status: string;
  user_stories: TraceabilityUserStory[];
  use_cases: TraceabilityUseCase[];
  arch_links: TraceabilityArchLink[];
  covered: boolean;
}

interface TraceabilityMatrix {
  requirements: TraceabilityRequirement[];
  coverage: {
    total: number;
    covered: number;
    percentage: number;
  };
}

export default function TraceabilityPage() {
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get("projectId");

  const { projects, fetchProjects } = useProjectStore();
  const {
    autoMapTraceability,
    solutions,
    fetchSolutions,
    managedComponents,
    fetchManagedComponents,
    traceabilityLinks,
    fetchTraceabilityLinks,
    createTraceabilityLink,
    updateTraceabilityLink,
    deleteTraceabilityLink,
    fetchComponentRequirements,
  } = useArchitectureStore();
  const { requirements, fetchRequirements } = useRequirementStore();

  const [selectedProjectId, setSelectedProjectId] = useState(
    projectIdFromUrl || ""
  );
  const [matrix, setMatrix] = useState<TraceabilityMatrix | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoMapping, setIsAutoMapping] = useState(false);

  // 追溯链接管理状态
  const [selectedSolutionId, setSelectedSolutionId] = useState("");
  const [isCreateLinkOpen, setIsCreateLinkOpen] = useState(false);
  const [isEditLinkOpen, setIsEditLinkOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingLink, setEditingLink] = useState<any>(null);
  const [createLinkData, setCreateLinkData] = useState({
    requirement_id: "",
    component_id: "",
    mapping_type: "direct",
    confidence: 0.8,
    rationale: "",
  });
  const [editLinkData, setEditLinkData] = useState({
    mapping_type: "",
    confidence: 0.8,
    rationale: "",
  });

  // 组件视角状态
  const [selectedComponentId, setSelectedComponentId] = useState("");
  const [componentReqs, setComponentReqs] = useState<any[]>([]);
  const [isLoadingComponentReqs, setIsLoadingComponentReqs] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (projectIdFromUrl) {
      setSelectedProjectId(projectIdFromUrl);
    }
  }, [projectIdFromUrl]);

  const fetchMatrix = async (projectId: string) => {
    setIsLoading(true);
    try {
      const response = await architectureAPI.getTraceabilityMatrix(projectId);
      setMatrix(response.data as TraceabilityMatrix);
    } catch {
      setMatrix(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedProjectId) {
      fetchMatrix(selectedProjectId);
    } else {
      setMatrix(null);
    }
  }, [selectedProjectId]);

  const handleAutoMap = async () => {
    if (!selectedProjectId) return;
    setIsAutoMapping(true);
    try {
      await autoMapTraceability(selectedProjectId);
      await fetchMatrix(selectedProjectId);
    } catch {
      // 静默处理
    } finally {
      setIsAutoMapping(false);
    }
  };

  // 项目切换时加载方案和需求
  useEffect(() => {
    if (selectedProjectId) {
      fetchSolutions(selectedProjectId);
      fetchRequirements(selectedProjectId);
    }
  }, [selectedProjectId, fetchSolutions, fetchRequirements]);

  // 方案选中时加载组件和追溯链接
  useEffect(() => {
    if (selectedProjectId && selectedSolutionId) {
      fetchManagedComponents(selectedProjectId, selectedSolutionId);
      fetchTraceabilityLinks(selectedProjectId, selectedSolutionId);
    }
  }, [selectedProjectId, selectedSolutionId, fetchManagedComponents, fetchTraceabilityLinks]);

  // 组件视角加载
  useEffect(() => {
    if (selectedProjectId && selectedSolutionId && selectedComponentId) {
      setIsLoadingComponentReqs(true);
      fetchComponentRequirements(selectedProjectId, selectedSolutionId, selectedComponentId)
        .then((data) => setComponentReqs(data || []))
        .catch(() => setComponentReqs([]))
        .finally(() => setIsLoadingComponentReqs(false));
    } else {
      setComponentReqs([]);
    }
  }, [selectedProjectId, selectedSolutionId, selectedComponentId, fetchComponentRequirements]);

  // 辅助函数：根据ID查找名称
  const getRequirementTitle = (id: string) => {
    const req = requirements.find((r: any) => r.id === id);
    return req?.title || id.slice(0, 8);
  };

  const getComponentName = (id: string) => {
    const comp = managedComponents.find((c: any) => c.id === id);
    return comp?.name || id.slice(0, 8);
  };

  // 创建追溯链接
  const handleCreateLink = async () => {
    if (!selectedProjectId || !selectedSolutionId) return;
    setIsSubmitting(true);
    try {
      await createTraceabilityLink(selectedProjectId, selectedSolutionId, createLinkData);
      setIsCreateLinkOpen(false);
      setCreateLinkData({
        requirement_id: "",
        component_id: "",
        mapping_type: "direct",
        confidence: 0.8,
        rationale: "",
      });
    } catch {
      // 静默处理
    } finally {
      setIsSubmitting(false);
    }
  };

  // 编辑追溯链接
  const handleEditLink = async () => {
    if (!selectedProjectId || !selectedSolutionId || !editingLink) return;
    setIsSubmitting(true);
    try {
      await updateTraceabilityLink(selectedProjectId, selectedSolutionId, editingLink.id, editLinkData);
      setIsEditLinkOpen(false);
      setEditingLink(null);
    } catch {
      // 静默处理
    } finally {
      setIsSubmitting(false);
    }
  };

  // 删除追溯链接
  const handleDeleteLink = async (linkId: string) => {
    if (!selectedProjectId || !selectedSolutionId) return;
    try {
      await deleteTraceabilityLink(selectedProjectId, selectedSolutionId, linkId);
    } catch {
      // 静默处理
    }
  };

  // 打开编辑对话框
  const openEditDialog = (link: any) => {
    setEditingLink(link);
    setEditLinkData({
      mapping_type: link.mapping_type || "direct",
      confidence: link.confidence ?? 0.8,
      rationale: link.rationale || "",
    });
    setIsEditLinkOpen(true);
  };

  const coverage = matrix?.coverage;
  const coveragePercentage = coverage?.percentage ?? 0;

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="追溯矩阵" />
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
                <SelectValue placeholder="请选择项目">
                  {selectedProjectId
                    ? projects.find((p) => p.id === selectedProjectId)?.name ?? selectedProjectId
                    : undefined}
                </SelectValue>
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
            <Button
              size="sm"
              variant="outline"
              onClick={handleAutoMap}
              disabled={isAutoMapping}
            >
              <GitBranch className="mr-2 h-4 w-4" />
              {isAutoMapping ? "映射中..." : "AI 自动追溯映射"}
            </Button>
          )}
        </div>

        {/* 加载状态 */}
        {isLoading && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm">正在加载追溯矩阵...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 自动映射中 */}
        {isAutoMapping && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm">AI 正在自动建立需求-架构追溯映射...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {!selectedProjectId ? (
          <Card>
            <CardContent className="py-12 text-center">
              <LayoutGrid className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">请选择项目</h3>
              <p className="text-muted-foreground">选择一个项目以查看需求追溯矩阵</p>
            </CardContent>
          </Card>
        ) : !isLoading && !matrix ? (
          <Card>
            <CardContent className="py-12 text-center">
              <LayoutGrid className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">暂无追溯数据</h3>
              <p className="text-muted-foreground">
                请先完成需求分析和架构设计，再使用 AI 自动追溯映射
              </p>
            </CardContent>
          </Card>
        ) : matrix && !isLoading ? (
          <>
            {/* 覆盖率统计卡片 */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>需求总数</CardDescription>
                  <CardTitle className="text-3xl">{coverage?.total ?? 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>已覆盖需求</CardDescription>
                  <CardTitle className="text-3xl text-green-600">
                    {coverage?.covered ?? 0}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>覆盖率</CardDescription>
                  <CardTitle className="text-3xl">{coveragePercentage}%</CardTitle>
                  <Progress value={coveragePercentage} className="h-2 mt-2" />
                </CardHeader>
              </Card>
            </div>

            {/* 追溯矩阵表格 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5" />
                  需求追溯矩阵
                </CardTitle>
                <CardDescription>
                  需求 → 用户故事 → 用例 → 架构组件 的完整追溯关系
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[250px]">需求</TableHead>
                      <TableHead>用户故事</TableHead>
                      <TableHead>用例</TableHead>
                      <TableHead>架构组件</TableHead>
                      <TableHead className="w-[100px]">状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matrix.requirements.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-sm">{req.title}</span>
                            <div className="flex gap-1 flex-wrap">
                              {req.priority && (
                                <Badge variant="outline" className="text-xs">
                                  {req.priority}
                                </Badge>
                              )}
                              {req.req_type && (
                                <Badge variant="secondary" className="text-xs">
                                  {req.req_type}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {req.user_stories.length > 0 ? (
                            <div className="space-y-1">
                              {req.user_stories.map((story, i) => (
                                <p key={i} className="text-xs text-muted-foreground">
                                  作为{story.role}，希望{story.goal}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {req.use_cases.length > 0 ? (
                            <div className="space-y-1">
                              {req.use_cases.map((uc, i) => (
                                <div key={i} className="flex items-center gap-1">
                                  <FileText className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs">{uc.title}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {uc.actor}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {req.arch_links.length > 0 ? (
                            <div className="space-y-1">
                              {req.arch_links.map((link, i) => (
                                <div key={i} className="flex items-center gap-1">
                                  <Badge variant="secondary" className="text-xs">
                                    {link.component_name}
                                  </Badge>
                                  {link.confidence >= 0.8 && (
                                    <Badge variant="outline" className="text-xs">
                                      高置信
                                    </Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {req.covered ? (
                            <Badge className="bg-green-600">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              已覆盖
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              <XCircle className="mr-1 h-3 w-3" />
                              未覆盖
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : null}

        {/* ===== 追溯链接管理区域 ===== */}
        {selectedProjectId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link className="h-5 w-5" />
                追溯链接管理
              </CardTitle>
              <CardDescription>
                手工管理需求与架构组件之间的追溯链接
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 方案选择器 */}
              <div className="flex items-center gap-4">
                <Label className="whitespace-nowrap">选择架构方案</Label>
                <Select
                  value={selectedSolutionId}
                  onValueChange={(v) => setSelectedSolutionId(v ?? "")}
                >
                  <SelectTrigger className="w-[300px]">
                    <SelectValue placeholder="请选择架构方案">
                      {selectedSolutionId
                        ? solutions.find((s: any) => s.id === selectedSolutionId)?.name ?? selectedSolutionId
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {solutions.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedSolutionId && (
                  <Button size="sm" onClick={() => setIsCreateLinkOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    新建追溯链接
                  </Button>
                )}
              </div>

              {/* 追溯链接列表表格 */}
              {selectedSolutionId && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>需求</TableHead>
                      <TableHead>组件</TableHead>
                      <TableHead>映射类型</TableHead>
                      <TableHead>置信度</TableHead>
                      <TableHead>理由</TableHead>
                      <TableHead className="w-[100px]">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {traceabilityLinks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          暂无追溯链接，点击“新建追溯链接”添加
                        </TableCell>
                      </TableRow>
                    ) : (
                      traceabilityLinks.map((link: any) => (
                        <TableRow key={link.id}>
                          <TableCell className="text-sm">
                            {getRequirementTitle(link.requirement_id)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {getComponentName(link.component_id)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {link.mapping_type || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {link.confidence == null ? (
                              <Badge className="bg-gray-400 text-xs">未知</Badge>
                            ) : link.confidence >= 0.8 ? (
                              <Badge className="bg-green-600 text-xs">高 {link.confidence}</Badge>
                            ) : link.confidence >= 0.5 ? (
                              <Badge className="bg-blue-600 text-xs">中 {link.confidence}</Badge>
                            ) : (
                              <Badge className="bg-yellow-600 text-xs">低 {link.confidence}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {link.rationale || "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEditDialog(link)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteLink(link.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* ===== 组件视角反向追溯 ===== */}
        {selectedProjectId && selectedSolutionId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                组件视角
              </CardTitle>
              <CardDescription>
                选择架构组件，查看其映射的所有需求
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Label className="whitespace-nowrap">选择组件</Label>
                <Select
                  value={selectedComponentId}
                  onValueChange={(v) => setSelectedComponentId(v ?? "")}
                >
                  <SelectTrigger className="w-[300px]">
                    <SelectValue placeholder="请选择组件">
                      {selectedComponentId
                        ? managedComponents.find((c: any) => c.id === selectedComponentId)?.name ?? selectedComponentId
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {managedComponents.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isLoadingComponentReqs && (
                <div className="flex items-center gap-3 py-4">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-sm text-muted-foreground">加载中...</span>
                </div>
              )}

              {!isLoadingComponentReqs && selectedComponentId && componentReqs.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">该组件暂无关联需求</p>
              )}

              {!isLoadingComponentReqs && componentReqs.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>需求标题</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>映射类型</TableHead>
                      <TableHead>置信度</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {componentReqs.map((item: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-sm">
                          {item.requirement_title || item.title || getRequirementTitle(item.requirement_id || "")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {item.requirement_type || item.req_type || item.type || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {item.mapping_type || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {item.confidence == null ? (
                            <Badge className="bg-gray-400 text-xs">未知</Badge>
                          ) : item.confidence >= 0.8 ? (
                            <Badge className="bg-green-600 text-xs">高 {item.confidence}</Badge>
                          ) : item.confidence >= 0.5 ? (
                            <Badge className="bg-blue-600 text-xs">中 {item.confidence}</Badge>
                          ) : (
                            <Badge className="bg-yellow-600 text-xs">低 {item.confidence}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* ===== 新建追溯链接对话框 ===== */}
        <Dialog open={isCreateLinkOpen} onOpenChange={setIsCreateLinkOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建追溯链接</DialogTitle>
              <DialogDescription>
                手动建立需求与架构组件之间的追溯关系
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>需求</Label>
                <Select
                  value={createLinkData.requirement_id}
                  onValueChange={(v) => {
                    if (v) setCreateLinkData((prev) => ({ ...prev, requirement_id: v }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择需求">
                      {createLinkData.requirement_id
                        ? getRequirementTitle(createLinkData.requirement_id)
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {requirements.map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>组件</Label>
                <Select
                  value={createLinkData.component_id}
                  onValueChange={(v) => {
                    if (v) setCreateLinkData((prev) => ({ ...prev, component_id: v }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择组件">
                      {createLinkData.component_id
                        ? getComponentName(createLinkData.component_id)
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {managedComponents.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>映射类型</Label>
                <Select
                  value={createLinkData.mapping_type}
                  onValueChange={(v) => {
                    if (v) setCreateLinkData((prev) => ({ ...prev, mapping_type: v }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择映射类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">直接映射</SelectItem>
                    <SelectItem value="indirect">间接映射</SelectItem>
                    <SelectItem value="partial">部分映射</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>置信度 (0-1)</Label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={createLinkData.confidence}
                  onChange={(e) =>
                    setCreateLinkData((prev) => ({
                      ...prev,
                      confidence: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>理由</Label>
                <Textarea
                  placeholder="请输入建立追溯关系的理由"
                  value={createLinkData.rationale}
                  onChange={(e) =>
                    setCreateLinkData((prev) => ({ ...prev, rationale: e.target.value }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateLinkOpen(false)}
                disabled={isSubmitting}
              >
                取消
              </Button>
              <Button
                onClick={handleCreateLink}
                disabled={
                  isSubmitting ||
                  !createLinkData.requirement_id ||
                  !createLinkData.component_id
                }
              >
                {isSubmitting ? "创建中..." : "创建"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ===== 编辑追溯链接对话框 ===== */}
        <Dialog open={isEditLinkOpen} onOpenChange={setIsEditLinkOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>编辑追溯链接</DialogTitle>
              <DialogDescription>
                修改追溯链接的映射类型、置信度和理由
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>映射类型</Label>
                <Select
                  value={editLinkData.mapping_type}
                  onValueChange={(v) => {
                    if (v) setEditLinkData((prev) => ({ ...prev, mapping_type: v }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择映射类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">直接映射</SelectItem>
                    <SelectItem value="indirect">间接映射</SelectItem>
                    <SelectItem value="partial">部分映射</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>置信度 (0-1)</Label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={editLinkData.confidence}
                  onChange={(e) =>
                    setEditLinkData((prev) => ({
                      ...prev,
                      confidence: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>理由</Label>
                <Textarea
                  placeholder="请输入理由"
                  value={editLinkData.rationale}
                  onChange={(e) =>
                    setEditLinkData((prev) => ({ ...prev, rationale: e.target.value }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsEditLinkOpen(false)}
                disabled={isSubmitting}
              >
                取消
              </Button>
              <Button onClick={handleEditLink} disabled={isSubmitting}>
                {isSubmitting ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
