// 文档管理页面 - SRS 文档生成与管理

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FileText,
  FileCheck,
  ChevronLeft,
  Clock,
  Pencil,
  Save,
  X,
  GitCompare,
  Download,
  Code2,
} from "lucide-react";
import MDEditor from "@uiw/react-md-editor";
import { diff_match_patch } from "diff-match-patch";
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
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useProjectStore,
  useDocumentStore,
  type DocumentItem,
} from "@/lib/project-store";

export default function DocumentsPage() {
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get("projectId");

  const { projects, fetchProjects } = useProjectStore();
  const {
    documents,
    currentDocument,
    isGenerating,
    isUpdating,
    compareResult,
    fetchDocuments,
    generateDocument,
    fetchDocument,
    updateDocument,
    compareDocuments,
    exportDocument,
  } = useDocumentStore();

  const [selectedProjectId, setSelectedProjectId] = useState(
    projectIdFromUrl || ""
  );
  const [isEditMode, setIsEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareV1, setCompareV1] = useState("");
  const [compareV2, setCompareV2] = useState("");
  const [diffHtml, setDiffHtml] = useState<string>("");

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
      fetchDocuments(selectedProjectId);
    }
  }, [selectedProjectId, fetchDocuments]);

  useEffect(() => {
    if (compareResult) {
      const dmp = new diff_match_patch();
      const v1Content =
        (compareResult.v1 as { content?: string })?.content ?? "";
      const v2Content =
        (compareResult.v2 as { content?: string })?.content ?? "";
      const diff = dmp.diff_main(v1Content, v2Content);
      dmp.diff_cleanupSemantic(diff);
      const html = dmp.diff_prettyHtml(diff);
      setDiffHtml(html);
    }
  }, [compareResult]);

  const handleGenerate = async () => {
    if (!selectedProjectId) return;
    await generateDocument(selectedProjectId);
  };

  const handleViewDocument = async (docId: string) => {
    if (!selectedProjectId) return;
    await fetchDocument(selectedProjectId, docId);
    setIsEditMode(false);
    setIsCompareMode(false);
  };

  const handleBack = () => {
    useDocumentStore.setState({ currentDocument: null, compareResult: null });
    setIsEditMode(false);
    setIsCompareMode(false);
    setDiffHtml("");
  };

  const handleStartEdit = () => {
    if (!currentDocument) return;
    setEditContent(currentDocument.content ?? "");
    setEditTitle(currentDocument.title);
    setIsEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedProjectId || !currentDocument) return;
    await updateDocument(selectedProjectId, currentDocument.id, {
      content: editContent,
      title: editTitle,
    });
    setIsEditMode(false);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
  };

  const handleCompare = async () => {
    if (!selectedProjectId || !compareV1 || !compareV2) return;
    await compareDocuments(selectedProjectId, compareV1, compareV2);
    setIsCompareMode(true);
  };

  const handleExport = async (format: string) => {
    if (!selectedProjectId || !currentDocument) return;
    const blob = await exportDocument(selectedProjectId, currentDocument.id, format);
    if (!blob) return;
    const url = window.URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${currentDocument.title || "document"}.${format}`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "未知";
    try {
      const date = new Date(dateStr);
      return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="文档管理" />
      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* 项目选择和操作栏 */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <Label className="whitespace-nowrap">选择项目</Label>
            <Select
              value={selectedProjectId}
              onValueChange={(v) => setSelectedProjectId(v ?? "")}
            >
              <SelectTrigger className="w-[300px] max-w-full">
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
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full sm:w-auto"
            >
              <FileCheck className="mr-2 h-4 w-4" />
              {isGenerating ? "生成中..." : "生成 SRS 文档"}
            </Button>
          )}
        </div>

        {/* 生成中进度 */}
        {isGenerating && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm">AI 正在生成需求规格说明书...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {!selectedProjectId ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">请选择项目</h3>
              <p className="text-muted-foreground">选择一个项目以管理 SRS 文档</p>
            </CardContent>
          </Card>
        ) : isCompareMode ? (
          /* 版本对比视图 */
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <GitCompare className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">版本对比</CardTitle>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setIsCompareMode(false); setDiffHtml(""); }}>
                  <X className="mr-1 h-4 w-4" />
                  关闭对比
                </Button>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4">
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <Label className="whitespace-nowrap">版本对比</Label>
                <Select value={compareV1} onValueChange={(v) => setCompareV1(v ?? "")}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="选择版本1">
                      {compareV1
                        ? (() => { const d = documents.find((doc) => doc.id === compareV1); return d ? `${d.title} (v${d.version})` : compareV1; })()
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {documents.map((doc) => (
                      <SelectItem key={doc.id} value={doc.id}>
                        {doc.title} (v{doc.version})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground">vs</span>
                <Select value={compareV2} onValueChange={(v) => setCompareV2(v ?? "")}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="选择版本2">
                      {compareV2
                        ? (() => { const d = documents.find((doc) => doc.id === compareV2); return d ? `${d.title} (v${d.version})` : compareV2; })()
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {documents.map((doc) => (
                      <SelectItem key={doc.id} value={doc.id}>
                        {doc.title} (v{doc.version})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handleCompare} disabled={!compareV1 || !compareV2}>
                  <GitCompare className="mr-2 h-4 w-4" />
                  对比
                </Button>
              </div>
              {diffHtml ? (
                <div
                  className="text-sm font-mono leading-relaxed bg-muted/50 rounded-lg p-4 max-h-[600px] overflow-auto"
                  dangerouslySetInnerHTML={{ __html: diffHtml }}
                />
              ) : (
                <pre className="text-sm text-muted-foreground text-center py-8">
                  选择两个版本后点击"对比"按钮查看差异
                </pre>
              )}
            </CardContent>
          </Card>
        ) : currentDocument ? (
          /* 文档详情视图 */
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="ghost" size="sm" onClick={handleBack}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  返回列表
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap mt-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <CardTitle className="text-lg truncate">{currentDocument.title}</CardTitle>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!isEditMode ? (
                    <>
                      <Button size="sm" variant="outline" onClick={handleStartEdit}>
                        <Pencil className="mr-2 h-4 w-4" />
                        编辑
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setIsCompareMode(true)}>
                        <GitCompare className="mr-2 h-4 w-4" />
                        版本对比
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button size="sm" variant="outline" />}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          导出
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleExport("md")}>
                            <Code2 className="mr-2 h-4 w-4" />
                            Markdown (.md)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExport("html")}>
                            <FileText className="mr-2 h-4 w-4" />
                            HTML (.html)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExport("txt")}>
                            <FileText className="mr-2 h-4 w-4" />
                            纯文本 (.txt)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  ) : (
                    <>
                      <Button size="sm" onClick={handleSaveEdit} disabled={isUpdating}>
                        <Save className="mr-2 h-4 w-4" />
                        {isUpdating ? "保存中..." : "保存"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                        <X className="mr-2 h-4 w-4" />
                        取消
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <CardDescription className="flex items-center gap-3 flex-wrap">
                <Badge variant="secondary">{currentDocument.doc_type}</Badge>
                <span>v{currentDocument.version}</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDate(currentDocument.created_at)}
                </span>
              </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4">
              {isEditMode ? (
                <div data-color-mode="light" className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="edit-title">文档标题</Label>
                    <input
                      id="edit-title"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                  </div>
                  <MDEditor
                    value={editContent}
                    onChange={(val) => setEditContent(val ?? "")}
                    height={500}
                    preview="live"
                  />
                </div>
              ) : (
                <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed bg-muted/50 rounded-lg p-4 max-h-[600px] overflow-auto">
                  {currentDocument.content || "文档内容为空"}
                </pre>
              )}
            </CardContent>
          </Card>
        ) : documents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">暂无文档</h3>
              <p className="text-muted-foreground">
                点击&quot;生成 SRS 文档&quot;按钮，AI 将根据需求分析结果自动生成需求规格说明书
              </p>
            </CardContent>
          </Card>
        ) : (
          /* 文档列表视图 */
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                文档列表
              </CardTitle>
              <CardDescription>
                共 {documents.length} 份文档，点击查看详情
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {documents.map((doc: DocumentItem) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-md border p-4 hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => handleViewDocument(doc.id)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 shrink-0">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.title}</p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <Badge variant="secondary" className="text-xs">
                            {doc.doc_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            v{doc.version}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(doc.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="shrink-0">
                      查看
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
