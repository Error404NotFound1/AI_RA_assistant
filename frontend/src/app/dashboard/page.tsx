// 工作台仪表盘

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FolderKanban,
  FileText,
  LayoutDashboard,
  BrainCircuit,
  TrendingUp,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { useProjectStore } from "@/lib/project-store";

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { projects, fetchProjects } = useProjectStore();
  const [stats, setStats] = useState({
    projectCount: 0,
    requirementCount: 0,
    architectureCount: 0,
  });

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (projects.length > 0) {
      setStats((prev) => ({ ...prev, projectCount: projects.length }));
    }
  }, [projects]);

  const statCards = [
    {
      title: "项目数量",
      value: stats.projectCount,
      icon: FolderKanban,
      description: "已创建的项目",
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      title: "需求数量",
      value: stats.requirementCount,
      icon: FileText,
      description: "已录入的需求",
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      title: "架构方案",
      value: stats.architectureCount,
      icon: LayoutDashboard,
      description: "AI 推荐的方案",
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      title: "AI 分析",
      value: 0,
      icon: BrainCircuit,
      description: "累计 AI 分析次数",
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
  ];

  const quickActions = [
    {
      title: "创建新项目",
      description: "开始一个新的软件工程项目",
      href: "/projects",
      icon: FolderKanban,
    },
    {
      title: "需求分析",
      description: "使用 AI 分析需求质量",
      href: "/requirements",
      icon: FileText,
    },
    {
      title: "架构设计",
      description: "获取 AI 架构推荐",
      href: "/architectures",
      icon: LayoutDashboard,
    },
    {
      title: "AI 助手",
      description: "与 AI 对话探讨方案",
      href: "/ai-assistant",
      icon: BrainCircuit,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="工作台" />
      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* 欢迎区域 */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">
              欢迎，{user?.full_name || user?.username}
            </h2>
            <p className="text-muted-foreground">
              使用 AI 驱动的工具提升软件工程效率
            </p>
          </div>
          <Link href="/projects">
            <Button>
              <FolderKanban className="mr-2 h-4 w-4" />
              新建项目
            </Button>
          </Link>
        </div>

        {/* 统计卡片 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`rounded-md p-2 ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground flex items-center mt-1">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 快捷操作 */}
        <div>
          <h3 className="text-lg font-semibold mb-4">快捷操作</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action) => (
              <Link key={action.title} href={action.href}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <action.icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">{action.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {action.description}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* 最近项目 */}
        {projects.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-4">最近项目</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.slice(0, 6).map((project) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        {project.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {project.description || "暂无描述"}
                      </p>
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {project.status === "active" ? "进行中" : project.status}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
