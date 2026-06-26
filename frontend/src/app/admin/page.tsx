// 管理员仪表盘页面

"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Activity,
  ShieldCheck,
  BarChart3,
  UserCog,
  ToggleLeft,
  ToggleRight,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/lib/auth-store";
import { adminAPI } from "@/lib/api";

interface AdminUser {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string | null;
}

interface DashboardStats {
  total_users: number;
  total_projects: number;
  total_requirements: number;
  total_analyses: number;
}

function getRoleLabel(role: string) {
  switch (role) {
    case "RE":
      return "需求工程师";
    case "SA":
      return "系统架构师";
    case "admin":
      return "管理员";
    default:
      return role;
  }
}

function getRoleBadgeVariant(role: string) {
  switch (role) {
    case "admin":
      return "default" as const;
    case "SA":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

export default function AdminPage() {
  const { user } = useAuthStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    total_users: 0,
    total_projects: 0,
    total_requirements: 0,
    total_analyses: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [usersRes, dashboardRes] = await Promise.all([
          adminAPI.listUsers(),
          adminAPI.getDashboard(),
        ]);
        setUsers(usersRes.data);
        setStats(dashboardRes.data);
      } catch {
        // 静默处理
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await adminAPI.updateUserRole(userId, role);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role } : u))
      );
    } catch {
      // 静默处理
    }
  };

  const handleToggleStatus = async (userId: string) => {
    try {
      await adminAPI.toggleUserStatus(userId);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, is_active: !u.is_active } : u
        )
      );
    } catch {
      // 静默处理
    }
  };

  // 非管理员不可访问
  if (user?.role !== "admin") {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="系统管理" />
        <div className="flex-1 flex items-center justify-center">
          <Card>
            <CardContent className="py-12 text-center">
              <ShieldCheck className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">权限不足</h3>
              <p className="text-muted-foreground">仅管理员可访问此页面</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="系统管理" />
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="系统管理" />
      <main className="flex-1 overflow-auto p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-bold">系统管理</h2>
          <p className="text-muted-foreground">管理系统用户、查看运行数据</p>
        </div>

        {/* 统计概览 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                用户总数
              </CardTitle>
              <Users className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_users}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                项目总数
              </CardTitle>
              <BarChart3 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_projects}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                需求总数
              </CardTitle>
              <Activity className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_requirements}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                AI 分析次数
              </CardTitle>
              <ShieldCheck className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_analyses}</div>
            </CardContent>
          </Card>
        </div>

        {/* 用户管理 */}
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">
              <Users className="mr-2 h-4 w-4" />
              用户管理
            </TabsTrigger>
            <TabsTrigger value="logs">
              <Activity className="mr-2 h-4 w-4" />
              操作日志
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>用户列表</CardTitle>
                <CardDescription>管理系统用户角色和状态</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>用户名</TableHead>
                      <TableHead>邮箱</TableHead>
                      <TableHead>姓名</TableHead>
                      <TableHead>角色</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>注册时间</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.username}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>{u.full_name || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={getRoleBadgeVariant(u.role)}>
                            {getRoleLabel(u.role)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.is_active ? "default" : "destructive"}>
                            {u.is_active ? "正常" : "禁用"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.created_at
                            ? new Date(u.created_at).toLocaleDateString("zh-CN")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Select
                              value={u.role}
                              onValueChange={(v) => handleRoleChange(u.id, v ?? u.role)}
                            >
                              <SelectTrigger className="h-8 w-[120px]">
                                <UserCog className="h-3 w-3 mr-1" />
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="RE">需求工程师</SelectItem>
                                <SelectItem value="SA">系统架构师</SelectItem>
                                <SelectItem value="admin">管理员</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggleStatus(u.id)}
                              title={u.is_active ? "禁用用户" : "启用用户"}
                            >
                              {u.is_active ? (
                                <ToggleRight className="h-4 w-4 text-green-600" />
                              ) : (
                                <ToggleLeft className="h-4 w-4 text-red-600" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle>操作日志</CardTitle>
                <CardDescription>系统操作审计记录</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground text-center py-8">
                  操作日志将通过 API 加载
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
