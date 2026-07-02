import type { Metadata } from "next";
import "./globals.css";
import { AppLayout } from "@/components/layout/app-layout";

export const metadata: Metadata = {
  title: "AI-SE 助手 - 软件工程需求分析与架构设计辅助系统",
  description: "基于 Web 的 AI 大模型驱动的软件工程需求分析与体系结构设计辅助系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased font-sans"
    >
      <body className="min-h-full flex flex-col">
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
