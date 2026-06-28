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
import { Progress } from "@/components/ui/progress";
import {
  useProjectStore,
  useArchitectureStore,
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
  const { autoMapTraceability } = useArchitectureStore();

  const [selectedProjectId, setSelectedProjectId] = useState(
    projectIdFromUrl || ""
  );
  const [matrix, setMatrix] = useState<TraceabilityMatrix | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoMapping, setIsAutoMapping] = useState(false);

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
      </main>
    </div>
  );
}
