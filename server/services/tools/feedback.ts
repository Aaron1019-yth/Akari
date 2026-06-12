import { readFile } from "../workspace-service.js";
import { analyzePdfReviewArtifact, createLearningArtifactForAnalysis, writeDailyReviewDocument } from "../feedback-service.js";
import type { ToolDef, ToolResult } from "../llm-types.js";

async function recordPdfReview(
  filePath: string,
  title: string,
  dailyTaskId: string | null,
  confirmedByUser: boolean,
  hint: string,
): Promise<ToolResult> {
  if (!confirmedByUser) {
    return { content: "用户尚未确认计入复盘，不能写入复盘数据。", ok: false };
  }

  try {
    const file = await readFile(filePath);
    const text = file.content.trim();
    if (!text) return { content: "文件文本为空，无法计入复盘。", ok: false };

    const artifact = createLearningArtifactForAnalysis({
      source_type: "workspace_file",
      source_ref: filePath,
      daily_task_id: dailyTaskId,
      title: title || filePath,
      raw_text: text,
      metadata: { origin: "chat_confirmed_pdf_review", mime: file.mime },
    });
    const result = await analyzePdfReviewArtifact({
      artifact_id: artifact.id,
      hint: hint || "用户已确认将该文件计入复盘数据；生成跨题诊断、记忆清单、回粉笔重做清单和计划建议。",
    });
    const diagnosisCount = result.report.weak_points.length;
    const reviewDocument = writeDailyReviewDocument(new Date().toISOString().slice(0, 10));
    return {
      content: `已计入复盘数据：${artifact.title || filePath}。生成 ${diagnosisCount} 条 PDF 诊断，${dailyTaskId ? "已关联所选任务" : "未关联具体任务"}，并已更新每日复盘文档 ${reviewDocument.path}。`,
      details: {
        artifact_id: artifact.id,
        review_id: result.review.id,
        daily_task_id: dailyTaskId,
        diagnosis_count: diagnosisCount,
        daily_review_path: reviewDocument.path,
      },
      ok: true,
    };
  } catch (err) {
    return { content: `计入复盘失败: ${err instanceof Error ? err.message : String(err)}`, ok: false };
  }
}

export function createFeedbackTools(): ToolDef[] {
  return [
    {
      name: "record_pdf_review",
      description:
        "用户明确确认将 workspace PDF/文档计入复盘后调用。读取文件、生成 Akari 复盘诊断，并写入日/周复盘聚合。不要在用户未确认时调用；不会修改任务卡或自动调整计划。",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "工作区内的相对文件路径，必须来自上传提示或 list_workspace_files/read_document 结果" },
          title: { type: "string", description: "用于显示的文件标题，可用原始文件名" },
          daily_task_id: { type: ["string", "null"], description: "用户选择关联的今日任务 ID；不关联时传 null" },
          confirmed_by_user: { type: "boolean", description: "只有用户已明确选择计入复盘时才传 true" },
          hint: { type: "string", description: "用户补充的分析要求或关联说明" },
        },
        required: ["file_path", "confirmed_by_user"],
      },
      execute: async (params) => recordPdfReview(
        params.file_path as string,
        (params.title as string) || "",
        typeof params.daily_task_id === "string" && params.daily_task_id.trim() ? params.daily_task_id : null,
        params.confirmed_by_user === true,
        (params.hint as string) || "",
      ),
    },
  ];
}
