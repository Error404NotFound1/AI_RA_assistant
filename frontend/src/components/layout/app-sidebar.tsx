// 应用侧边栏导航

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  FolderKanban,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  BrainCircuit,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuthStore } from "@/lib/auth-store";

const navItems = [
  { icon: Home, title: "工作台", path: "/dashboard" },
  { icon: FolderKanban, title: "项目管理", path: "/projects" },
  { icon: FileText, title: "需求分析", path: "/requirements" },
  { icon: LayoutDashboard, title: "架构设计", path: "/architectures" },
  { icon: BrainCircuit, title: "AI 助手", path: "/ai-assistant" },
];

const adminItems = [
  { icon: ShieldCheck, title: "系统管理", path: "/admin" },
];

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

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-6 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center">
        <Link href="/dashboard" className="flex items-center gap-2">
          <BrainCircuit className="h-7 w-7 text-primary" />
          <span className="text-lg font-bold group-data-[collapsible=icon]:hidden">
            AI-SE 助手
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>导航菜单</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  pathname === item.path ||
                  pathname.startsWith(item.path + "/");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={isActive}
                      render={<Link href={item.path} />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {user?.role === "admin" && (
          <SidebarGroup>
            <SidebarGroupLabel>管理</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => {
                  const isActive =
                    pathname === item.path ||
                    pathname.startsWith(item.path + "/");
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        tooltip={item.title}
                        isActive={isActive}
                        render={<Link href={item.path} />}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">
              {user?.username?.charAt(0)?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-medium">{user?.full_name || user?.username}</span>
            <span className="text-xs text-muted-foreground">
              {user ? getRoleLabel(user.role) : ""}
            </span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
