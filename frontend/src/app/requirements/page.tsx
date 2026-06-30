// 需求分析页面

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  BrainCircuit,
  CheckCircle2,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Paperclip,
  Trash2,
  Download,
  Loader2,
  Pencil,
  RefreshCw,
} from "lucide-react";
import MDEditor from "@uiw/react-md-editor";
import plantumlEncoder from "plantuml-encoder";
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
  useProjectStore,
  useRequirementStore,
  useAttachmentStore,
  type Requirement,
} from "@/lib/project-store";
import { attachmentAPI, requirementAPI, aiReviewAPI } from "@/lib/api";

// AI 建议结果数据结构
interface AISuggestion {
  suggested_type: string;
  type_confidence: number;
  improved_description: string;
  completeness_suggestions: string[];
  related_requirements: string[];
  quality_tips: string[];
}

// AI 建议类型中文映射
const typeLabels: Record<string, string> = {
  functional: "功能需求",
  non_functional: "非功能需求",
  constraint: "约束",
  business_rule: "业务规则",
};

// AI 建议面板组件
function AISuggestionPanel({
  suggestion,
  onAdoptDescription,
}: {
  suggestion: AISuggestion;
  onAdoptDescription: (desc: string) => void;
}) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-semibold text-blue-700">AI 建议</span>
      </div>

      {/* 推荐类型 + 置信度 */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          {typeLabels[suggestion.suggested_type] || suggestion.suggested_type}
        </Badge>
        <span className="text-xs text-muted-foreground">
          置信度：{Math.round(suggestion.type_confidence * 100)}%
        </span>
      </div>

      {/* 完善后的描述 */}
      {suggestion.improved_description && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">完善后的描述</span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs"
              onClick={() => onAdoptDescription(suggestion.improved_description)}
            >
              采纳
            </Button>
          </div>
          <p className="text-sm bg-white rounded p-2 border">
            {suggestion.improved_description}
          </p>
        </div>
      )}

      {/* 补全建议 */}
      {suggestion.completeness_suggestions && suggestion.completeness_suggestions.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">补全建议</span>
          <ul className="text-xs space-y-0.5 list-disc list-inside">
            {suggestion.completeness_suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 相关需求 */}
      {suggestion.related_requirements && suggestion.related_requirements.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">可能相关的需求</span>
          <ul className="text-xs space-y-0.5 list-disc list-inside">
            {suggestion.related_requirements.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 质量提升建议 */}
      {suggestion.quality_tips && suggestion.quality_tips.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">质量提升建议</span>
          <ul className="text-xs space-y-0.5 list-disc list-inside">
            {suggestion.quality_tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// 图表类型中文标签
const diagramTypeLabels: Record<string, string> = {
  use_case: "用例图",
  use_case_diagram: "用例图",
  activity: "活动图",
  activity_diagram: "活动图",
  sequence: "时序图",
  sequence_diagram: "时序图",
  state: "状态图",
  state_diagram: "状态图",
  class: "类图",
  class_diagram: "类图",
  dfd: "数据流图",
  dfd_diagram: "数据流图",
  er: "ER图",
  er_diagram: "ER图",
};

function PlantUMLDiagram({ code, title, type }: { code: string; title: string; type: string }) {
  const [showSource, setShowSource] = useState(false);
  const encoded = plantumlEncoder.encode(code);
  const imageUrl = `https://www.plantuml.com/plantuml/img/${encoded}`;

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{diagramTypeLabels[type] || type}</Badge>
          <span className="font-medium">{title}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowSource(!showSource)}>
          {showSource ? "隐藏源码" : "查看源码"}
        </Button>
      </div>
      <div className="flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={title} className="max-w-full" />
      </div>
      {showSource && (
        <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

// 质量评估数据结构
interface QualityEvaluation {
  completeness: number | null;
  consistency: string | null;
  verifiability: number | null;
  unambiguity: number | null;
  traceability: string | null;
  feasibility: number | null;
  singularity: string | null;
  suggestions: Record<string, unknown> | null;
}

function QualityScoreBar({ label, value }: { label: string; value: number | null }) {
  if (value === null || value === undefined) return null;
  const percentage = Math.min(value * 10, 100);
  const colorClass =
    value >= 8
      ? "bg-green-500"
      : value >= 5
      ? "bg-blue-500"
      : "bg-yellow-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}/10</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${colorClass}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function QualityPassBadge({ label, value }: { label: string; value: string | null }) {
  if (value === null || value === undefined) return null;
  const passed = value === "通过";
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Badge
        variant="outline"
        className={passed ? "bg-green-50 text-green-700 border-green-300" : "bg-red-50 text-red-700 border-red-300"}
      >
        {value}
      </Badge>
    </div>
  );
}

function QualityPanel({ projectId, reqId }: { projectId: string; reqId: string }) {
  const [quality, setQuality] = useState<QualityEvaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    requirementAPI
      .getQuality(projectId, reqId)
      .then((res) => {
        if (!cancelled) setQuality(res.data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectId, reqId]);

  if (loading) {
    return (
      <div className="rounded-md border p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载质量评估...
        </div>
      </div>
    );
  }

  if (error || !quality) {
    return (
      <div className="rounded-md border p-4">
        <p className="text-sm text-muted-foreground">暂无质量评估</p>
      </div>
    );
  }

  const hasSuggestions = quality.suggestions && Object.keys(quality.suggestions).length > 0;

  return (
    <div className="rounded-md border p-4 space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-1">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        质量评估（INCOSE）
      </h4>
      {/* 数值型属性 */}
      <div className="space-y-2">
        <QualityScoreBar label="完整性" value={quality.completeness} />
        <QualityScoreBar label="可验证性" value={quality.verifiability} />
        <QualityScoreBar label="无歧义性" value={quality.unambiguity} />
        <QualityScoreBar label="可行性" value={quality.feasibility} />
      </div>
      {/* 通过/不通过型属性 */}
      <Separator />
      <div className="space-y-2">
        <QualityPassBadge label="一致性" value={quality.consistency} />
        <QualityPassBadge label="可追溯性" value={quality.traceability} />
        <QualityPassBadge label="单一性" value={quality.singularity} />
      </div>
      {/* 改进建议 */}
      {hasSuggestions && (
        <>
          <Separator />
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">改进建议</p>
            <div className="text-xs text-muted-foreground space-y-0.5">
              {Object.entries(quality.suggestions!).map(([key, val]) => (
                <p key={key}>
                  <span className="font-medium">{key}：</span>
                  {String(val)}
                </p>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AnalysisResultCard({
  requirement,
  projectId,
}: {
  requirement: {
    id: string;
    title: string;
    description: string;
    status: string;
    is_ai_extracted: boolean;
    analysis_result: Record<string, unknown> | null;
    priority: string | null;
  };
  projectId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reqStats, setReqStats] = useState<{ analyze_count: number; view_count: number } | null>(null);

  useEffect(() => {
    if (projectId && requirement.id) {
      aiReviewAPI.getRequirementStats(projectId, requirement.id)
        .then((res) => setReqStats(res.data))
        .catch(() => { /* 静默处理 */ });
    }
  }, [projectId, requirement.id]);

  const analysis = requirement.analysis_result as {
    intent_analysis?: { business_goal: string; domain: string; stakeholders: string[]; assumptions: string[] };
    functional_requirements?: Array<{ id: string; title: string; description: string; type: string; source: string; rationale: string; sub_requirements?: string[]; inputs?: string[]; outputs?: string[]; business_rules?: string[]; data_entities?: string[] }>;
    non_functional_requirements?: Array<{ id: string; title: string; description: string; category: string; source: string; rationale: string; quantitative_metric?: string; acceptance_threshold?: string; verification_method?: string }>;
    user_stories?: Array<{ requirement_id: string; role: string; goal: string; benefit: string; acceptance_criteria?: string }>;
    classification?: { classified_requirements: Array<{ id: string; priority: string; rationale: string }> };
    use_cases?: Array<{ requirement_id: string; title: string; actor: string; preconditions: string; main_flow: string[]; alternative_flows: string[]; postconditions: string }>;
    diagrams?: Record<string, string>;
  } | null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline">待分析</Badge>;
      case "analyzed":
        return <Badge variant="secondary">已分析</Badge>;
      case "confirmed":
        return <Badge className="bg-green-600">已确认</Badge>;
      case "needs_revision":
        return <Badge variant="destructive">需修改</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <CardTitle className="text-base">{requirement.title}</CardTitle>
              {getStatusBadge(requirement.status)}
              {requirement.is_ai_extracted && (
                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-300">
                  AI提取
                </Badge>
              )}
              {requirement.priority && (
                <Badge variant="outline" className="text-xs">
                  {requirement.priority}
                </Badge>
              )}
              {reqStats && (
                <>
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">🔍 {reqStats.analyze_count} 次分析</Badge>
                  <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-300">👁 {reqStats.view_count} 次查看</Badge>
                </>
              )}
            </div>
            <CardDescription className="line-clamp-2">
              {requirement.description}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      {expanded && analysis && (
        <CardContent className="space-y-4">
          <Separator />
          {/* 意图分析 */}
          {analysis.intent_analysis && (
            <div className="rounded-md bg-blue-50 p-3 space-y-1">
              <p className="text-sm font-medium">意图分析</p>
              <p className="text-xs text-muted-foreground">业务目标：{analysis.intent_analysis.business_goal}</p>
              {analysis.intent_analysis.domain && (
                <p className="text-xs text-muted-foreground">业务领域：{analysis.intent_analysis.domain}</p>
              )}
              {analysis.intent_analysis.stakeholders && analysis.intent_analysis.stakeholders.length > 0 && (
                <p className="text-xs text-muted-foreground">利益相关者：{analysis.intent_analysis.stakeholders.join("、")}</p>
              )}
              {analysis.intent_analysis.assumptions && analysis.intent_analysis.assumptions.length > 0 && (
                <p className="text-xs text-muted-foreground">假设：{analysis.intent_analysis.assumptions.join("、")}</p>
              )}
            </div>
          )}
          {/* AI 分析结果 */}
          {analysis.user_stories && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                <Sparkles className="h-4 w-4 text-primary" />
                提取的用户故事
              </h4>
              <div className="space-y-2">
                {analysis.user_stories!.map(
                  (story, i) => (
                    <div
                      key={i}
                      className="rounded-md bg-muted p-3 text-sm"
                    >
                      <p>
                        作为 <strong>{story.role}</strong>，我希望
                        <strong> {story.goal}</strong>，以便
                        <strong> {story.benefit}</strong>
                      </p>
                      {story.acceptance_criteria && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          验收标准：{story.acceptance_criteria}
                        </p>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* 需求分类（MoSCoW） */}
          {analysis.classification?.classified_requirements && analysis.classification.classified_requirements.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">需求分类（MoSCoW）</h4>
              {(() => {
                const reqs = analysis.classification.classified_requirements || [];
                // classified_requirements 仅含 {id, priority, rationale}，需从 FR/NFR 交叉引用标题
                const titleMap = new Map<string, string>();
                (analysis.functional_requirements || []).forEach((fr) => {
                  titleMap.set(fr.id, fr.title || fr.id);
                });
                (analysis.non_functional_requirements || []).forEach((nfr) => {
                  titleMap.set(nfr.id, nfr.title || nfr.id);
                });
                // 兼容 "Won't" / "Wont" 两种写法
                const isWont = (p: string) => p === "Won't" || p === "Wont";
                const groups: Record<string, Array<{ id: string; priority: string; rationale: string }>> = {
                  Must: reqs.filter((r) => r.priority === "Must"),
                  Should: reqs.filter((r) => r.priority === "Should"),
                  Could: reqs.filter((r) => r.priority === "Could"),
                  "Won't": reqs.filter((r) => isWont(r.priority)),
                };
                const total = reqs.length || 1;
                const badgeStyles: Record<string, string> = {
                  Must: "bg-red-100 text-red-800 border-red-300",
                  Should: "bg-orange-100 text-orange-800 border-orange-300",
                  Could: "bg-blue-100 text-blue-800 border-blue-300",
                  "Won't": "bg-gray-100 text-gray-600 border-gray-300",
                };
                const labels: Record<string, string> = {
                  Must: "必须",
                  Should: "应该",
                  Could: "可能",
                  "Won't": "不会",
                };
                const labelColors: Record<string, string> = {
                  Must: "text-red-700",
                  Should: "text-orange-700",
                  Could: "text-blue-700",
                  "Won't": "text-gray-600",
                };
                return (
                  <>
                    {/* 统计概览 */}
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(groups).map(([priority, items]) =>
                        items.length > 0 ? (
                          <Badge
                            key={priority}
                            variant="outline"
                            className={badgeStyles[priority]}
                          >
                            {labels[priority]}：{items.length} 条 ({Math.round((items.length / total) * 100)}%)
                          </Badge>
                        ) : null
                      )}
                    </div>
                    {/* 分组列表 */}
                    <div className="space-y-2">
                      {Object.entries(groups).map(([key, items]) =>
                        items.length > 0 ? (
                          <div key={key} className="space-y-1">
                            <div className={`text-xs font-medium ${labelColors[key]}`}>
                              {labels[key]}（{key}）：
                            </div>
                            <ul className="text-xs list-disc list-inside ml-2 space-y-0.5">
                              {items.map((item, i) => (
                                <li key={i}>
                                  {titleMap.get(item.id) || item.id}
                                  {item.rationale ? (
                                    <span className="text-muted-foreground"> — {item.rationale}</span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* 功能需求详细拆解 */}
          {analysis.functional_requirements && analysis.functional_requirements.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">功能需求详细拆解</h4>
              {analysis.functional_requirements.map((fr, i) => (
                <div key={i} className="border rounded p-2 space-y-1">
                  <div className="font-medium text-sm">{fr.title || fr.id}</div>
                  {fr.sub_requirements && fr.sub_requirements.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground">子需求:</span>
                      <ul className="text-xs list-disc list-inside ml-2">
                        {fr.sub_requirements.map((sr, j) => <li key={j}>{sr}</li>)}
                      </ul>
                    </div>
                  )}
                  {fr.inputs && fr.inputs.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground">输入:</span>
                      <span className="text-xs ml-1">{fr.inputs.join(", ")}</span>
                    </div>
                  )}
                  {fr.outputs && fr.outputs.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground">输出:</span>
                      <span className="text-xs ml-1">{fr.outputs.join(", ")}</span>
                    </div>
                  )}
                  {fr.business_rules && fr.business_rules.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground">业务规则:</span>
                      <ul className="text-xs list-disc list-inside ml-2">
                        {fr.business_rules.map((br, j) => <li key={j}>{br}</li>)}
                      </ul>
                    </div>
                  )}
                  {fr.data_entities && fr.data_entities.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground">数据实体:</span>
                      <span className="text-xs ml-1">{fr.data_entities.join(", ")}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 非功能需求详细规格 */}
          {analysis.non_functional_requirements && analysis.non_functional_requirements.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">非功能需求详细规格</h4>
              {analysis.non_functional_requirements.map((nfr, i) => (
                <div key={i} className="border rounded p-2 space-y-1">
                  <div className="font-medium text-sm">{nfr.title || nfr.id}</div>
                  {nfr.quantitative_metric && (
                    <div>
                      <span className="text-xs text-muted-foreground">量化指标:</span>
                      <span className="text-xs ml-1">{nfr.quantitative_metric}</span>
                    </div>
                  )}
                  {nfr.acceptance_threshold && (
                    <div>
                      <span className="text-xs text-muted-foreground">验收阈值:</span>
                      <span className="text-xs ml-1">{nfr.acceptance_threshold}</span>
                    </div>
                  )}
                  {nfr.verification_method && (
                    <div>
                      <span className="text-xs text-muted-foreground">验证方法:</span>
                      <span className="text-xs ml-1">{nfr.verification_method}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {analysis.use_cases && analysis.use_cases.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                <FileText className="h-4 w-4 text-blue-500" />
                用例描述
              </h4>
              <div className="space-y-3">
                {analysis.use_cases.map((uc, i) => (
                  <div key={i} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{uc.actor}</Badge>
                      <span className="text-sm font-medium">{uc.title}</span>
                    </div>
                    {uc.preconditions && (
                      <p className="text-xs text-muted-foreground">
                        <strong>前置条件：</strong>{uc.preconditions}
                      </p>
                    )}
                    {uc.main_flow && uc.main_flow.length > 0 && (
                      <div className="text-xs">
                        <strong>主流程：</strong>
                        <ol className="list-decimal list-inside mt-1 space-y-0.5">
                          {uc.main_flow.map((step, j) => (
                            <li key={j}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {uc.alternative_flows && uc.alternative_flows.length > 0 && (
                      <div className="text-xs">
                        <strong>异常流程：</strong>
                        <ul className="list-disc list-inside mt-1 space-y-0.5">
                          {uc.alternative_flows.map((flow, j) => (
                            <li key={j}>{flow}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {uc.postconditions && (
                      <p className="text-xs text-muted-foreground">
                        <strong>后置条件：</strong>{uc.postconditions}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 软件工程图表 */}
          {analysis.diagrams && Object.keys(analysis.diagrams).length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">软件工程图表</h4>
              <div className="grid grid-cols-1 gap-4">
                {Object.entries(analysis.diagrams).map(([type, code]) => (
                  <PlantUMLDiagram
                    key={type}
                    code={code as string}
                    title={diagramTypeLabels[type] || type}
                    type={type}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 质量评估 */}
          {projectId && (
            <QualityPanel projectId={projectId} reqId={requirement.id} />
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function RequirementsPage() {
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get("projectId");

  const { projects, fetchProjects } = useProjectStore();
  const {
    requirements,
    isAnalyzing,
    analysisProgress,
    analysisError,
    fetchRequirements,
    createRequirement,
    analyzeRequirements,
    confirmRequirement,
    deleteRequirement,
    reAnalyzeRequirement,
  } = useRequirementStore();
  const {
    attachments,
    isUploading,
    fetchAttachments,
    uploadAttachment,
    deleteAttachment,
  } = useAttachmentStore();

  const [selectedProjectId, setSelectedProjectId] = useState(
    projectIdFromUrl || ""
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newReq, setNewReq] = useState({
    title: "",
    description: "",
    source: "",
  });
  const [isCreating, setIsCreating] = useState(false);
  const [createSuggestion, setCreateSuggestion] = useState<AISuggestion | null>(null);
  const [isCreateSuggesting, setIsCreateSuggesting] = useState(false);
  const [createSuggestError, setCreateSuggestError] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importContent, setImportContent] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importAttachmentId, setImportAttachmentId] = useState<string>("");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<Requirement | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [editSuggestion, setEditSuggestion] = useState<AISuggestion | null>(null);
  const [isEditSuggesting, setIsEditSuggesting] = useState(false);
  const [editSuggestError, setEditSuggestError] = useState("");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingReq, setDeletingReq] = useState<Requirement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reAnalyzingId, setReAnalyzingId] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (projectIdFromUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedProjectId(projectIdFromUrl);
    }
  }, [projectIdFromUrl]);

  useEffect(() => {
    if (selectedProjectId) {
      fetchRequirements(selectedProjectId);
      fetchAttachments(selectedProjectId);
    }
  }, [selectedProjectId, fetchRequirements, fetchAttachments]);

  const handleUploadFile = async (file: File) => {
    if (!selectedProjectId) return;
    await uploadAttachment(selectedProjectId, file);
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!selectedProjectId) return;
    await deleteAttachment(selectedProjectId, attachmentId);
  };

  const handleDownloadAttachment = async (attachmentId: string, filename: string) => {
    if (!selectedProjectId) return;
    try {
      const response = await attachmentAPI.download(selectedProjectId, attachmentId);
      const url = window.URL.createObjectURL(response.data as Blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      // 静默处理
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleCreate = async () => {
    if (!selectedProjectId || !newReq.title.trim()) return;
    setIsCreating(true);
    try {
      await createRequirement(selectedProjectId, newReq);
      setIsCreateOpen(false);
      setNewReq({ title: "", description: "", source: "" });
      setCreateSuggestion(null);
      setCreateSuggestError("");
    } catch {
      // 静默处理
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateSuggest = async () => {
    if (!selectedProjectId || (!newReq.title.trim() && !newReq.description.trim())) return;
    setIsCreateSuggesting(true);
    setCreateSuggestError("");
    setCreateSuggestion(null);
    try {
      const res = await requirementAPI.suggestRequirement(selectedProjectId, {
        title: newReq.title,
        description: newReq.description,
      });
      setCreateSuggestion(res.data as AISuggestion);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      setCreateSuggestError(axiosError.response?.data?.detail || "AI 建议获取失败");
    } finally {
      setIsCreateSuggesting(false);
    }
  };

  const handleEditSuggest = async () => {
    if (!selectedProjectId || (!editForm.title.trim() && !editForm.description.trim())) return;
    setIsEditSuggesting(true);
    setEditSuggestError("");
    setEditSuggestion(null);
    try {
      const res = await requirementAPI.suggestRequirement(selectedProjectId, {
        title: editForm.title,
        description: editForm.description,
      });
      setEditSuggestion(res.data as AISuggestion);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      setEditSuggestError(axiosError.response?.data?.detail || "AI 建议获取失败");
    } finally {
      setIsEditSuggesting(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedProjectId) return;
    await analyzeRequirements(selectedProjectId);
  };

  const handleConfirm = async (reqId: string) => {
    if (!selectedProjectId) return;
    await confirmRequirement(selectedProjectId, reqId);
  };

  const handleOpenEdit = (req: Requirement) => {
    setEditingReq(req);
    setEditForm({ title: req.title, description: req.description });
    setEditSuggestion(null);
    setEditSuggestError("");
    setIsEditOpen(true);
  };

  const handleSaveEdit = async (withReAnalyze: boolean) => {
    if (!selectedProjectId || !editingReq || !editForm.title.trim()) return;
    setIsSaving(true);
    try {
      await requirementAPI.update(selectedProjectId, editingReq.id, {
        title: editForm.title,
        description: editForm.description,
      });
      setIsEditOpen(false);
      if (withReAnalyze) {
        setReAnalyzingId(editingReq.id);
        try {
          await reAnalyzeRequirement(selectedProjectId, editingReq.id);
        } catch {
          // 静默处理
        } finally {
          setReAnalyzingId(null);
        }
      } else {
        await fetchRequirements(selectedProjectId);
      }
    } catch {
      // 静默处理
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenDelete = (req: Requirement) => {
    setDeletingReq(req);
    setIsDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedProjectId || !deletingReq) return;
    setIsDeleting(true);
    try {
      await deleteRequirement(selectedProjectId, deletingReq.id);
      setIsDeleteOpen(false);
    } catch {
      // 静默处理
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReAnalyze = async (reqId: string) => {
    if (!selectedProjectId) return;
    setReAnalyzingId(reqId);
    try {
      await reAnalyzeRequirement(selectedProjectId, reqId);
    } catch {
      // 静默处理
    } finally {
      setReAnalyzingId(null);
    }
  };

  const handleImportAndAnalyze = async () => {
    if (!selectedProjectId || (!importContent.trim() && !importAttachmentId)) return;
    setIsImporting(true);
    setImportError("");
    try {
      await requirementAPI.importAndAnalyze(
        selectedProjectId,
        importContent,
        importAttachmentId || undefined
      );
      await fetchRequirements(selectedProjectId);
      setImportContent("");
      setImportAttachmentId("");
      setIsImportOpen(false);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      setImportError(axiosError.response?.data?.detail || "导入失败，请重试");
    } finally {
      setIsImporting(false);
    }
  };

  // 按来源分类需求
  const userRequirements = requirements.filter((req) => !req.is_ai_extracted);
  const aiRequirements = requirements.filter((req) => req.is_ai_extracted);

  const renderRequirementItem = (req: Requirement, isUserReq: boolean) => (
    <div key={req.id} className="relative">
      <AnalysisResultCard requirement={req} projectId={selectedProjectId} />
      <div className="mt-2 flex justify-end items-center gap-2">
        {isUserReq && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleOpenEdit(req)}
            >
              <Pencil className="mr-1 h-3 w-3" />
              编辑
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleOpenDelete(req)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-1 h-3 w-3" />
              删除
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleReAnalyze(req.id)}
              disabled={reAnalyzingId === req.id}
            >
              {reAnalyzingId === req.id ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              重新分析
            </Button>
          </>
        )}
        {req.status === "analyzed" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleConfirm(req.id)}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            确认需求
          </Button>
        )}
        {req.status === "confirmed" && (
          <span className="text-sm text-green-600 font-medium flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" />
            已确认
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="需求分析" />
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
            <div className="flex items-center gap-2">
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger render={<Button size="sm" />}>
                  <Plus className="mr-2 h-4 w-4" />
                  添加需求
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>添加新需求</DialogTitle>
                    <DialogDescription>
                      输入需求信息，稍后可使用 AI 进行分析
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="req-title">需求标题</Label>
                      <Input
                        id="req-title"
                        placeholder="请输入需求标题"
                        value={newReq.title}
                        onChange={(e) =>
                          setNewReq((prev) => ({
                            ...prev,
                            title: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2" data-color-mode="light">
                      <Label htmlFor="req-desc">需求描述</Label>
                      <MDEditor
                        value={newReq.description}
                        onChange={(val) =>
                          setNewReq((prev) => ({ ...prev, description: val || "" }))
                        }
                        height={200}
                        preview="edit"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="req-source">需求来源（选填）</Label>
                      <Input
                        id="req-source"
                        placeholder="如：客户访谈、需求规格说明书等"
                        value={newReq.source}
                        onChange={(e) =>
                          setNewReq((prev) => ({
                            ...prev,
                            source: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>附件上传</Label>
                      <Input
                        type="file"
                        disabled={isUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadFile(file);
                        }}
                      />
                      {isUploading && (
                        <p className="text-xs text-muted-foreground">上传中...</p>
                      )}
                    </div>
                    {/* AI 建议按钮 */}
                    <div className="pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCreateSuggest}
                        disabled={isCreateSuggesting || (!newReq.title.trim() && !newReq.description.trim())}
                      >
                        {isCreateSuggesting ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            获取建议中...
                          </>
                        ) : (
                          "💡 AI建议"
                        )}
                      </Button>
                    </div>
                    {/* AI 建议错误 */}
                    {createSuggestError && (
                      <p className="text-sm text-destructive">{createSuggestError}</p>
                    )}
                    {/* AI 建议面板 */}
                    {createSuggestion && (
                      <AISuggestionPanel
                        suggestion={createSuggestion}
                        onAdoptDescription={(desc) =>
                          setNewReq((prev) => ({ ...prev, description: desc }))
                        }
                      />
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsCreateOpen(false)}
                    >
                      取消
                    </Button>
                    <Button onClick={handleCreate} disabled={isCreating}>
                      {isCreating ? "添加中..." : "添加"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
                <DialogTrigger render={<Button size="sm" variant="outline" />}>
                  <FileText className="mr-2 h-4 w-4" />
                  从文档导入需求
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>从文档导入需求</DialogTitle>
                    <DialogDescription>
                      粘贴计划书或需求文档内容，AI 将自动提取所有需求并逐条分析
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="import-content">文档内容</Label>
                      <Textarea
                        id="import-content"
                        placeholder="在此粘贴计划书/需求文档的完整内容..."
                        className="min-h-[300px] font-mono text-sm"
                        value={importContent}
                        onChange={(e) => setImportContent(e.target.value)}
                      />
                    </div>
                    {attachments.length > 0 && (
                      <div className="space-y-2">
                        <Label>从附件导入（可选）</Label>
                        <Select
                          value={importAttachmentId}
                          onValueChange={(v) => setImportAttachmentId(v ?? "")}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择已上传的附件">
                              {importAttachmentId
                                ? attachments.find((att) => att.id === importAttachmentId)?.filename ?? importAttachmentId
                                : undefined}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {attachments.map((att) => (
                              <SelectItem key={att.id} value={att.id}>
                                {att.filename}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {importError && (
                      <p className="text-sm text-destructive">{importError}</p>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsImportOpen(false)}
                      disabled={isImporting}
                    >
                      取消
                    </Button>
                    <Button
                      onClick={handleImportAndAnalyze}
                      disabled={(!importContent.trim() && !importAttachmentId) || isImporting}
                    >
                      {isImporting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          正在提取和分析...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          提取并分析
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button
                size="sm"
                variant="default"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
              >
                <BrainCircuit className="mr-2 h-4 w-4" />
                {isAnalyzing ? "分析中..." : "AI 分析"}
              </Button>
            </div>
          )}
        </div>

        {/* 分析进度 */}
        {isAnalyzing && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm">{analysisProgress || "AI 正在分析需求..."}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 分析错误提示 */}
        {analysisError && !isAnalyzing && (
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-red-500">
                  {analysisProgress || "分析失败，请重试"}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 需求列表 */}
        {!selectedProjectId ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">请选择项目</h3>
              <p className="text-muted-foreground">选择一个项目以查看和管理需求</p>
            </CardContent>
          </Card>
        ) : requirements.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">暂无需求</h3>
              <p className="text-muted-foreground">
                添加需求并使用 AI 进行智能分析
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* 用户添加的需求 */}
            {userRequirements.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <h3 className="text-base font-semibold">用户需求</h3>
                  <Badge variant="secondary">{userRequirements.length} 条</Badge>
                </div>
                {userRequirements.map((req) => renderRequirementItem(req, true))}
              </div>
            )}
            {/* AI 提取的需求 */}
            {aiRequirements.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <BrainCircuit className="h-4 w-4 text-purple-600" />
                  <h3 className="text-base font-semibold">AI 提取需求</h3>
                  <Badge variant="secondary">{aiRequirements.length} 条</Badge>
                </div>
                {aiRequirements.map((req) => renderRequirementItem(req, false))}
              </div>
            )}
          </div>
        )}

        {/* 附件列表 */}
        {selectedProjectId && attachments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Paperclip className="h-4 w-4" />
                项目附件
              </CardTitle>
              <CardDescription>
                共 {attachments.length} 个附件
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{att.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(att.file_size)}
                          {att.file_type ? ` · ${att.file_type}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDownloadAttachment(att.id, att.filename)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteAttachment(att.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 编辑需求对话框 */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>编辑需求</DialogTitle>
              <DialogDescription>
                修改需求信息，保存后可选择是否重新进行 AI 分析
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">需求标题</Label>
                <Input
                  id="edit-title"
                  placeholder="请输入需求标题"
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2" data-color-mode="light">
                <Label htmlFor="edit-desc">需求描述</Label>
                <MDEditor
                  value={editForm.description}
                  onChange={(val) =>
                    setEditForm((prev) => ({ ...prev, description: val || "" }))
                  }
                  height={200}
                  preview="edit"
                />
              </div>
              {/* AI 建议按钮 */}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleEditSuggest}
                  disabled={isEditSuggesting || (!editForm.title.trim() && !editForm.description.trim())}
                >
                  {isEditSuggesting ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      获取建议中...
                    </>
                  ) : (
                    "💡 AI建议"
                  )}
                </Button>
              </div>
              {/* AI 建议错误 */}
              {editSuggestError && (
                <p className="text-sm text-destructive">{editSuggestError}</p>
              )}
              {/* AI 建议面板 */}
              {editSuggestion && (
                <AISuggestionPanel
                  suggestion={editSuggestion}
                  onAdoptDescription={(desc) =>
                    setEditForm((prev) => ({ ...prev, description: desc }))
                  }
                />
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsEditOpen(false)}
                disabled={isSaving}
              >
                取消
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSaveEdit(false)}
                disabled={isSaving || !editForm.title.trim()}
              >
                {isSaving ? "保存中..." : "仅保存"}
              </Button>
              <Button
                onClick={() => handleSaveEdit(true)}
                disabled={isSaving || !editForm.title.trim()}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    处理中...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    保存并重新分析
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 删除确认对话框 */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认删除</DialogTitle>
              <DialogDescription>
                确定要删除需求「{deletingReq?.title}」吗？从该需求 AI 提取的所有子需求也将被一并删除。此操作无法撤销。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDeleteOpen(false)}
                disabled={isDeleting}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    删除中...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    确认删除
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
