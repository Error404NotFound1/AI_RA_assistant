// 项目详情页面

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  LayoutDashboard,
  BrainCircuit,
  ArrowLeft,
  Settings,
  Users,
  Trash2,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProjectStore, useRequirementStore, useArchitectureStore } from "@/lib/project-store";
import { projectAPI } from "@/lib/api";

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const { currentProject, fetchProject } = useProjectStore();
  const { requirements, fetchRequirements } = useRequirementStore();
  const { solutions, fetchSolutions } = useArchitectureStore();
  const [isLoading, setIsLoading] = useState(true);

  // 成员管理状态
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      await Promise.all([
        fetchProject(projectId),
        fetchRequirements(projectId),
        fetchSolutions(projectId),
      ]);
      setIsLoading(false);
    }
    if (projectId) load();
  }, [projectId, fetchProject, fetchRequirements, fetchSolutions]);

  // 加载成员列表
  const loadMembers = async () => {
    setMembersLoading(true);
    try {
      const res = await projectAPI.getMembers(projectId);
      setMembers(res.data);
    } catch {
      // 静默处理
    } finally {
      setMembersLoading(false);
    }
  };

  // 打开成员管理 Dialog
  const handleOpenMembers = () => {
    setIsMembersOpen(true);
    loadMembers();
  };

  // 移除成员
  const handleRemoveMember = async (userId: string, username: string) => {
    if (!confirm(`确定移除成员「${username}」？`)) return;
    setRemovingId(userId);
    try {
      await projectAPI.removeMember(projectId, userId);
      await loadMembers();
    } catch {
      // 静默处理
    } finally {
      setRemovingId(null);
    }
  };

  // 修改成员角色
  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await projectAPI.updateMemberRole(projectId, userId, newRole);
      await loadMembers();
    } catch {
      // 静默处理
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">项目不存在</h2>
            <Button onClick={() => router.push("/projects")}>返回项目列表</Button>
          </div>
        </div>
      </div>
    );
  }

  const draftReqs = requirements.filter((r) => r.status === "draft");
  const analyzedReqs = requirements.filter((r) => r.status === "analyzed");
  const confirmedReqs = requirements.filter((r) => r.status === "confirmed");

  return (
    <div className="flex flex-col h-full">
      <AppHeader title={currentProject.name} />
      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* 项目信息头部 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push("/projects")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold">{currentProject.name}</h2>
              <p className="text-muted-foreground">
                {currentProject.description || "暂无描述"}
              </p>
            </div>
          </div>
          <Badge variant="outline">
            {currentProject.status === "active" ? "进行中" : currentProject.status}
          </Badge>
        </div>

        {/* 项目统计 */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">总需求</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{requirements.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">待分析</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{draftReqs.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">已分析</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{analyzedReqs.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">已确认</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{confirmedReqs.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* 项目功能 Tab */}
        <Tabs defaultValue="requirements" className="space-y-4">
          <TabsList>
            <TabsTrigger value="requirements">
              <FileText className="mr-2 h-4 w-4" />
              需求管理
            </TabsTrigger>
            <TabsTrigger value="architectures">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              架构方案
            </TabsTrigger>
            <TabsTrigger value="ai">
              <BrainCircuit className="mr-2 h-4 w-4" />
              AI 分析
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="mr-2 h-4 w-4" />
              项目设置
            </TabsTrigger>
          </TabsList>

          <TabsContent value="requirements" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">需求列表</h3>
              <Link href={`/requirements?projectId=${projectId}`}>
                <Button size="sm">查看全部需求</Button>
              </Link>
            </div>
            {requirements.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  暂无需求，点击上方按钮管理需求
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {requirements.slice(0, 5).map((req) => (
                  <Card key={req.id}>
                    <CardContent className="py-3 flex items-center justify-between">
                      <div className="flex-1">
                        <span className="font-medium">{req.title}</span>
                        {req.priority && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {req.priority}
                          </Badge>
                        )}
                      </div>
                      <Badge
                        variant={
                          req.status === "confirmed"
                            ? "default"
                            : req.status === "analyzed"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {req.status === "draft"
                          ? "待分析"
                          : req.status === "analyzed"
                            ? "已分析"
                            : req.status === "confirmed"
                              ? "已确认"
                              : req.status}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="architectures" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">架构方案</h3>
              <Link href={`/architectures?projectId=${projectId}`}>
                <Button size="sm">查看全部方案</Button>
              </Link>
            </div>
            {solutions.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  暂无架构方案，使用 AI 推荐生成架构方案
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {solutions.map((sol) => (
                  <Card key={sol.id}>
                    <CardContent className="py-3 flex items-center justify-between">
                      <div>
                        <span className="font-medium">{sol.name}</span>
                        {sol.pattern && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {sol.pattern}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        v{sol.version}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="ai" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <Link href={`/requirements?projectId=${projectId}&action=analyze`}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <BrainCircuit className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">AI 需求分析</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      基于 INCOSE 标准自动评估需求质量，提取用户故事并分类
                    </p>
                  </CardContent>
                </Link>
              </Card>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <Link href={`/architectures?projectId=${projectId}&action=recommend`}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <BrainCircuit className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">AI 架构推荐</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      基于 ADD 方法自动推荐架构方案，支持架构评审和追溯映射
                    </p>
                  </CardContent>
                </Link>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>项目信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">项目名称</span>
                  <span>{currentProject.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">状态</span>
                  <span>{currentProject.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">创建时间</span>
                  <span>
                    {currentProject.created_at
                      ? new Date(currentProject.created_at).toLocaleString("zh-CN")
                      : "未知"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 成员管理 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>项目成员</CardTitle>
                <Button size="sm" onClick={handleOpenMembers}>
                  <Users className="mr-2 h-4 w-4" />
                  管理成员
                </Button>
              </CardHeader>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 成员管理 Dialog */}
        <Dialog open={isMembersOpen} onOpenChange={setIsMembersOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>项目成员管理</DialogTitle>
              <DialogDescription>
                查看和管理项目成员，修改角色或移除成员
              </DialogDescription>
            </DialogHeader>
            {membersLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用户名</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.user_id}>
                      <TableCell className="font-medium">
                        {member.username}
                        {member.is_owner && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            所有者
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{member.full_name || "-"}</TableCell>
                      <TableCell>
                        {member.is_owner ? (
                          <span className="text-sm text-muted-foreground">{member.role}</span>
                        ) : (
                          <Select
                            value={member.role}
                            onValueChange={(val) => handleRoleChange(member.user_id, val)}
                          >
                            <SelectTrigger className="w-24 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="RE">RE</SelectItem>
                              <SelectItem value="SA">SA</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!member.is_owner && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleRemoveMember(member.user_id, member.username)}
                            disabled={removingId === member.user_id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsMembersOpen(false)}>
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
