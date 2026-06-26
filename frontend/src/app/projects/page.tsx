// 项目列表页面

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, FolderKanban, MoreHorizontal, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjectStore } from "@/lib/project-store";

export default function ProjectsPage() {
  const { projects, isLoading, fetchProjects, createProject, deleteProject } =
    useProjectStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", description: "" });
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async () => {
    if (!newProject.name.trim()) return;
    setIsCreating(true);
    try {
      const project = await createProject(newProject);
      setIsCreateOpen(false);
      setNewProject({ name: "", description: "" });
      // 跳转到项目详情
      window.location.href = `/projects/${project.id}`;
    } catch {
      // 静默处理
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("确定要删除这个项目吗？此操作不可撤销。")) {
      await deleteProject(id);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="项目管理" />
      <main className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">我的项目</h2>
            <p className="text-muted-foreground">
              管理您的软件工程项目，进行需求分析和架构设计
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger render={<Button />}>
              <Plus className="mr-2 h-4 w-4" />
              新建项目
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>创建新项目</DialogTitle>
                <DialogDescription>
                  填写项目信息以创建新项目
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">项目名称</Label>
                  <Input
                    id="name"
                    placeholder="请输入项目名称"
                    value={newProject.name}
                    onChange={(e) =>
                      setNewProject((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">项目描述</Label>
                  <Textarea
                    id="description"
                    placeholder="请输入项目描述（选填）"
                    value={newProject.description}
                    onChange={(e) =>
                      setNewProject((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    rows={3}
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
                  {isCreating ? "创建中..." : "创建"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FolderKanban className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">还没有项目</h3>
            <p className="text-muted-foreground mb-4">
              创建您的第一个项目，开始使用 AI 辅助软件工程
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              新建项目
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="hover:shadow-md transition-shadow group"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <Link href={`/projects/${project.id}`} className="flex-1">
                      <CardTitle className="text-base hover:text-primary transition-colors">
                        {project.name}
                      </CardTitle>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(project.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除项目
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {project.description || "暂无描述"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {project.status === "active"
                        ? "进行中"
                        : project.status === "completed"
                          ? "已完成"
                          : project.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      创建于{" "}
                      {project.created_at
                        ? new Date(project.created_at).toLocaleDateString("zh-CN")
                        : "未知"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
