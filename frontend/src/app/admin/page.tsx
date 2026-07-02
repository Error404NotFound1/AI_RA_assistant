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
  Download,
  Search,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

// ===== 类型定义 =====
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

interface StatisticsData {
  ai_usage?: {
    total_calls: number;
    by_action: Record<string, number>;
  };
  requirement_coverage?: {
    total: number;
    analyzed: number;
    confirmed: number;
    analysis_coverage: number;
    confirmation_rate: number;
  };
  structured_data?: {
    user_stories: number;
    use_cases: number;
    traceability_links: number;
  };
  documents?: {
    total: number;
    by_type?: Array<{ type: string; count: number }>;
  };
  attachments?: {
    total: number;
    total_size: number;
  };
  project_activity?: Array<{
    project_id: string;
    project_name: string;
    requirement_count: number;
    architecture_count: number;
    last_activity: string | null;
  }>;
}

interface LogItem {
  id: string;
  user_id: string;
  username: string;
  action: string;
  target_type: string;
  target_id: string;
  detail: string;
  created_at: string;
}

interface LogFilters {
  action: string;
  target_type: string;
  start_date: string;
  end_date: string;
}

// ===== 工具函数 =====
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

function getActionBadgeClass(action: string): string {
  if (action.startsWith("create")) return "bg-green-100 text-green-800 border-green-200";
  if (action.startsWith("update")) return "bg-blue-100 text-blue-800 border-blue-200";
  if (action.startsWith("delete")) return "bg-red-100 text-red-800 border-red-200";
  if (["analyze", "recommend", "auto_map", "generate_document"].includes(action)) return "bg-purple-100 text-purple-800 border-purple-200";
  return "bg-gray-100 text-gray-800 border-gray-200";
}

function getActionLabel(action: string): string {
  const map: Record<string, string> = {
    analyze: "分析",
    recommend: "推荐",
    auto_map: "自动映射",
    generate_document: "生成文档",
    create: "创建",
    update: "更新",
    delete: "删除",
  };
  return map[action] || action;
}

function getTargetTypeLabel(type: string): string {
  const map: Record<string, string> = {
    requirement: "需求",
    architecture: "架构",
    document: "文档",
    project: "项目",
    user: "用户",
  };
  return map[type] || type;
}

function truncateId(id: string, maxLen = 8): string {
  if (!id) return "-";
  return id.length > maxLen ? id.slice(0, maxLen) + "..." : id;
}

// ===== 主组件 =====
export default function AdminPage() {
  const { user } = useAuthStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    total_users: 0,
    total_projects: 0,
    total_requirements: 0,
    total_analyses: 0,
  });
  const [statistics, setStatistics] = useState<StatisticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 日志状态
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPageSize] = useState(20);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logFilters, setLogFilters] = useState<LogFilters>({
    action: "",
    target_type: "",
    start_date: "",
    end_date: "",
  });
  const [activeFilters, setActiveFilters] = useState<LogFilters>({
    action: "",
    target_type: "",
    start_date: "",
    end_date: "",
  });

  // 统计加载状态
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [usersRes, dashboardRes, statsRes] = await Promise.all([
          adminAPI.listUsers(),
          adminAPI.getDashboard(),
          adminAPI.getStatistics().catch(() => null),
        ]);
        setUsers(usersRes.data);
        setStats({
          total_users: dashboardRes.data.user_count ?? 0,
          total_projects: dashboardRes.data.project_count ?? 0,
          total_requirements: dashboardRes.data.requirement_count ?? 0,
          total_analyses: dashboardRes.data.ai_usage_count ?? 0,
        });
        if (statsRes) setStatistics(statsRes.data);
      } catch {
        // 静默处理
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // 加载日志
  const loadLogs = async (page: number, filters: LogFilters) => {
    setLogsLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: logsPageSize };
      if (filters.action) params.action = filters.action;
      if (filters.target_type) params.target_type = filters.target_type;
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      const res = await adminAPI.getLogs(params as Parameters<typeof adminAPI.getLogs>[0]);
      setLogs(res.data.items || []);
      setLogsTotal(res.data.total || 0);
      setLogsPage(res.data.page || page);
    } catch {
      setLogs([]);
      setLogsTotal(0);
    } finally {
      setLogsLoading(false);
    }
  };

  // 加载统计详情
  const loadStatistics = async () => {
    setStatsLoading(true);
    try {
      const res = await adminAPI.getStatistics();
      setStatistics(res.data);
    } catch {
      // 静默处理
    } finally {
      setStatsLoading(false);
    }
  };

  const handleSearchLogs = () => {
    setActiveFilters({ ...logFilters });
    loadLogs(1, logFilters);
  };

  const handleResetFilters = () => {
    const emptyFilters: LogFilters = { action: "", target_type: "", start_date: "", end_date: "" };
    setLogFilters(emptyFilters);
    setActiveFilters(emptyFilters);
    loadLogs(1, emptyFilters);
  };

  const handleLogsPageChange = (newPage: number) => {
    loadLogs(newPage, activeFilters);
  };

  const handleExportLogs = async () => {
    try {
      const params: Record<string, string> = {};
      if (activeFilters.action) params.action = activeFilters.action;
      if (activeFilters.target_type) params.target_type = activeFilters.target_type;
      if (activeFilters.start_date) params.start_date = activeFilters.start_date;
      if (activeFilters.end_date) params.end_date = activeFilters.end_date;
      const res = await adminAPI.exportLogs(params as Parameters<typeof adminAPI.exportLogs>[0]);
      const blob = new Blob([res.data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `operation_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      // 静默处理
    }
  };

  const handleTabChange = (value: string) => {
    if (value === "logs" && logs.length === 0) {
      loadLogs(1, activeFilters);
    }
    if (value === "statistics") {
      loadStatistics();
    }
  };

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

  // 计算统计卡片数据
  const aiUsageByAction = statistics?.ai_usage?.by_action ?? {};
  const aiUsageTotal =
    statistics?.ai_usage?.total_calls ??
    Object.values(aiUsageByAction).reduce((sum, count) => sum + count, 0);
  const coverageRate = statistics?.requirement_coverage?.analysis_coverage ?? 0;
  const recommendCount = aiUsageByAction.recommend ?? 0;
  const docGenCount =
    (aiUsageByAction.generate_document ?? 0) +
    (aiUsageByAction.generate_arch_doc ?? 0);

  const totalPages = Math.ceil(logsTotal / logsPageSize);

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

        {/* 标签页 */}
        <Tabs defaultValue="users" onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="users">
              <Users className="mr-2 h-4 w-4" />
              用户管理
            </TabsTrigger>
            <TabsTrigger value="logs">
              <Activity className="mr-2 h-4 w-4" />
              操作日志
            </TabsTrigger>
            <TabsTrigger value="statistics">
              <BarChart3 className="mr-2 h-4 w-4" />
              统计信息
            </TabsTrigger>
          </TabsList>

          {/* 用户管理 */}
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
                                <SelectValue>
                                  {u.role === "RE" ? "需求工程师" : u.role === "SA" ? "系统架构师" : u.role === "admin" ? "管理员" : u.role}
                                </SelectValue>
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

          {/* 操作日志 */}
          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>操作日志</CardTitle>
                <CardDescription>系统操作审计记录</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 过滤栏 */}
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">操作类型</label>
                    <Select
                      value={logFilters.action || "all"}
                      onValueChange={(v) => setLogFilters((f) => ({ ...f, action: (!v || v === "all") ? "" : v }))}
                    >
                      <SelectTrigger className="w-[140px] h-9">
                        <SelectValue placeholder="全部操作" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部操作</SelectItem>
                        <SelectItem value="analyze">分析</SelectItem>
                        <SelectItem value="recommend">推荐</SelectItem>
                        <SelectItem value="auto_map">自动映射</SelectItem>
                        <SelectItem value="generate_document">生成文档</SelectItem>
                        <SelectItem value="create">创建</SelectItem>
                        <SelectItem value="update">更新</SelectItem>
                        <SelectItem value="delete">删除</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">目标类型</label>
                    <Select
                      value={logFilters.target_type || "all"}
                      onValueChange={(v) => setLogFilters((f) => ({ ...f, target_type: (!v || v === "all") ? "" : v }))}
                    >
                      <SelectTrigger className="w-[140px] h-9">
                        <SelectValue placeholder="全部类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部类型</SelectItem>
                        <SelectItem value="requirement">需求</SelectItem>
                        <SelectItem value="architecture">架构</SelectItem>
                        <SelectItem value="document">文档</SelectItem>
                        <SelectItem value="project">项目</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">开始日期</label>
                    <Input
                      type="date"
                      className="w-[150px] h-9"
                      value={logFilters.start_date}
                      onChange={(e) => setLogFilters((f) => ({ ...f, start_date: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">结束日期</label>
                    <Input
                      type="date"
                      className="w-[150px] h-9"
                      value={logFilters.end_date}
                      onChange={(e) => setLogFilters((f) => ({ ...f, end_date: e.target.value }))}
                    />
                  </div>
                  <Button size="sm" onClick={handleSearchLogs}>
                    <Search className="h-4 w-4 mr-1" />
                    搜索
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleResetFilters}>
                    <RotateCcw className="h-4 w-4 mr-1" />
                    重置
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleExportLogs}>
                    <Download className="h-4 w-4 mr-1" />
                    导出CSV
                  </Button>
                </div>

                {/* 日志表格 */}
                {logsLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  </div>
                ) : logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    暂无日志记录
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>时间</TableHead>
                        <TableHead>用户名</TableHead>
                        <TableHead>操作类型</TableHead>
                        <TableHead>目标类型</TableHead>
                        <TableHead>目标ID</TableHead>
                        <TableHead>详情摘要</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString("zh-CN")}
                          </TableCell>
                          <TableCell className="font-medium">{log.username}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={getActionBadgeClass(log.action)}>
                              {getActionLabel(log.action)}
                            </Badge>
                          </TableCell>
                          <TableCell>{getTargetTypeLabel(log.target_type)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground font-mono" title={log.target_id}>
                            {truncateId(log.target_id)}
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate" title={log.detail}>
                            {log.detail || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {/* 分页 */}
                {logsTotal > 0 && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-sm text-muted-foreground">
                      共 {logsTotal} 条记录
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={logsPage <= 1}
                        onClick={() => handleLogsPageChange(logsPage - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        上一页
                      </Button>
                      <span className="text-sm">
                        第 {logsPage} / {totalPages} 页
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={logsPage >= totalPages}
                        onClick={() => handleLogsPageChange(logsPage + 1)}
                      >
                        下一页
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 统计信息 */}
          <TabsContent value="statistics" className="space-y-4">
            {statsLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : (
              <>
                {/* 统计卡片 */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        AI 使用总频次
                      </CardTitle>
                      <Activity className="h-4 w-4 text-purple-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{aiUsageTotal}</div>
                      <p className="text-xs text-muted-foreground mt-1">所有 AI 功能调用总计</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        需求分析覆盖率
                      </CardTitle>
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{coverageRate.toFixed(1)}%</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {statistics?.requirement_coverage?.analyzed || 0} / {statistics?.requirement_coverage?.total || 0} 已分析
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        架构推荐总次数
                      </CardTitle>
                      <BarChart3 className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{recommendCount}</div>
                      <p className="text-xs text-muted-foreground mt-1">架构方案推荐调用</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        文档生成总次数
                      </CardTitle>
                      <BarChart3 className="h-4 w-4 text-orange-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{docGenCount}</div>
                      <p className="text-xs text-muted-foreground mt-1">文档自动生成调用</p>
                    </CardContent>
                  </Card>
                </div>

                {/* 项目活跃度列表 */}
                <Card>
                  <CardHeader>
                    <CardTitle>项目活跃度</CardTitle>
                    <CardDescription>各项目使用情况统计</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {statistics?.project_activity && statistics.project_activity.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>项目名称</TableHead>
                            <TableHead>需求数</TableHead>
                            <TableHead>架构方案数</TableHead>
                            <TableHead>最近活动时间</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {statistics.project_activity.map((proj) => (
                            <TableRow key={proj.project_id}>
                              <TableCell className="font-medium">{proj.project_name}</TableCell>
                              <TableCell>{proj.requirement_count}</TableCell>
                              <TableCell>{proj.architecture_count}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {proj.last_activity
                                  ? new Date(proj.last_activity).toLocaleString("zh-CN")
                                  : "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        暂无项目活动数据
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
