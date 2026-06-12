import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../main.js";

async function createPlan() {
  const resp = await request(app)
    .post("/api/planner/generate")
    .send({
      target_score: 150,
      exam_date: "2026-12-01",
      strengths: ["言语理解与表达"],
      weaknesses: ["资料分析", "数量关系"],
    });
  expect(resp.status).toBe(200);
  const task = resp.body.weekly_plan.tasks[0];
  expect(task.id).toBeTruthy();
  return { goal: resp.body, task };
}

describe("V2 feedback API", () => {
  it("saves task completion feedback and updates the task", async () => {
    const { task } = await createPlan();

    const resp = await request(app)
      .patch(`/api/planner/task/${task.id}/feedback`)
      .send({
        actual_minutes: 42,
        difficulty: "hard",
        focus: "normal",
        note: "资料分析计算速度慢",
      });

    expect(resp.status).toBe(200);
    expect(resp.body.feedback.daily_task_id).toBe(task.id);
    expect(resp.body.feedback.actual_minutes).toBe(42);

    const updatedTask = resp.body.goal.weekly_plan.tasks.find(
      (item: { id: string }) => item.id === task.id
    );
    expect(updatedTask.status).toBe("completed");
    expect(updatedTask.actual_minutes).toBe(42);
  });

  it("creates artifacts and confirms generated error candidates", async () => {
    const { task } = await createPlan();

    const artifactResp = await request(app)
      .post("/api/feedback/artifacts")
      .send({
        source_type: "manual",
        source_ref: "",
        daily_task_id: task.id,
        title: "资料分析错题",
        raw_text: "资料分析增长率题，计算时把同比方向看反了",
        metadata: { origin: "test" },
      });
    expect(artifactResp.status).toBe(200);
    expect(artifactResp.body.artifact.daily_task_id).toBe(task.id);

    const candidateResp = await request(app)
      .post("/api/feedback/candidates/generate")
      .send({
        artifact_id: artifactResp.body.artifact.id,
        daily_task_id: task.id,
        hint: "我计算错了",
      });
    expect(candidateResp.status).toBe(200);
    expect(candidateResp.body.candidate.status).toBe("pending");
    expect(candidateResp.body.candidate.subject).toBeTruthy();

    const pendingResp = await request(app).get("/api/feedback/candidates?status=pending");
    expect(pendingResp.status).toBe(200);
    expect(
      pendingResp.body.candidates.some(
        (item: { id: string }) => item.id === candidateResp.body.candidate.id
      )
    ).toBe(true);

    const confirmResp = await request(app)
      .patch(`/api/feedback/candidates/${candidateResp.body.candidate.id}`)
      .send({
        status: "confirmed",
        cause: "公式理解不稳",
        suggested_fix: "建立公式卡片并做同类题",
      });
    expect(confirmResp.status).toBe(200);
    expect(confirmResp.body.candidate.status).toBe("confirmed");
    expect(confirmResp.body.candidate.confirmed_at).toBeTruthy();
  });

  it("analyzes PDF-style text into a review report and confirmed diagnostics", async () => {
    const { task } = await createPlan();
    const artifactResp = await request(app)
      .post("/api/feedback/artifacts")
      .send({
        source_type: "workspace_file",
        source_ref: "fenbi.pdf",
        daily_task_id: task.id,
        title: "粉笔错题 PDF",
        raw_text: "1. 根据材料，下列说法正确的是哪一项？\nA. 甲\nB. 乙\n2. 资料分析比重变化题，以下判断正确的是？\nA. 上升\nB. 下降",
        metadata: { origin: "test" },
      })
      .expect(200);

    const reportResp = await request(app)
      .post("/api/feedback/artifacts/analyze-pdf-review")
      .send({ artifact_id: artifactResp.body.artifact.id })
      .expect(200);

    expect(reportResp.body.artifact.id).toBe(artifactResp.body.artifact.id);
    expect(reportResp.body.review.scope).toBe("daily");
    expect(reportResp.body.review.summary).toContain("# 粉笔错题 PDF 复盘分析");
    expect(reportResp.body.review.stats.pdf_review_report).toBeTruthy();
    expect(reportResp.body.review.stats.pdf_review_count).toBeGreaterThanOrEqual(1);
    expect(reportResp.body.report.overview).toBeTruthy();
    expect(reportResp.body.report.weak_points.length).toBeGreaterThanOrEqual(1);
    expect(reportResp.body.report.fenbi_redo_actions.length).toBeGreaterThanOrEqual(1);
    expect(reportResp.body.report.source_warnings.length).toBeGreaterThanOrEqual(1);

    const confirmedResp = await request(app).get("/api/feedback/candidates?status=confirmed").expect(200);
    const pdfDiagnostics = confirmedResp.body.candidates.filter(
      (item: { artifact_id: string; question_type: string; daily_task_id: string }) => item.artifact_id === artifactResp.body.artifact.id && item.question_type === "PDF诊断"
    );
    expect(pdfDiagnostics.length).toBeGreaterThanOrEqual(1);
    expect(pdfDiagnostics[0].daily_task_id).toBe(task.id);

    await request(app)
      .post("/api/feedback/artifacts/analyze-pdf-review")
      .send({ artifact_id: artifactResp.body.artifact.id })
      .expect(200);
    const confirmedAgainResp = await request(app).get("/api/feedback/candidates?status=confirmed").expect(200);
    const pdfDiagnosticsAgain = confirmedAgainResp.body.candidates.filter(
      (item: { artifact_id: string; question_type: string }) => item.artifact_id === artifactResp.body.artifact.id && item.question_type === "PDF诊断"
    );
    expect(pdfDiagnosticsAgain.length).toBe(pdfDiagnostics.length);
  });

  it("aggregates unlinked PDF diagnostics into daily and weekly review", async () => {
    const { task } = await createPlan();
    const artifactResp = await request(app)
      .post("/api/feedback/artifacts")
      .send({
        source_type: "workspace_file",
        source_ref: "unlinked-fenbi.pdf",
        daily_task_id: null,
        title: "未关联粉笔错题 PDF",
        raw_text: "粉笔错题 PDF：言语逻辑填空成语辨析错误，资料分析增长率计算慢，需要回粉笔重做。",
        metadata: { origin: "test" },
      })
      .expect(200);

    await request(app)
      .post("/api/feedback/artifacts/analyze-pdf-review")
      .send({ artifact_id: artifactResp.body.artifact.id })
      .expect(200);

    const today = new Date().toISOString().slice(0, 10);
    const dailyResp = await request(app).get(`/api/feedback/daily?date=${today}`).expect(200);
    expect(dailyResp.body.stats.confirmed_error_count).toBeGreaterThanOrEqual(1);
    expect(dailyResp.body.stats.pdf_review_count).toBeGreaterThanOrEqual(1);
    expect(
      dailyResp.body.confirmed_errors.some(
        (item: { artifact_id: string; daily_task_id: string | null }) => item.artifact_id === artifactResp.body.artifact.id && item.daily_task_id === null
      )
    ).toBe(true);

    const weeklyResp = await request(app)
      .post("/api/feedback/weekly")
      .send({
        week_start: "2026-01-01",
        week_end: "2026-12-31",
        regenerate: true,
      })
      .expect(200);
    expect(weeklyResp.body.review.stats.confirmed_error_count).toBeGreaterThanOrEqual(1);
    expect(weeklyResp.body.review.stats.pdf_review_count).toBeGreaterThanOrEqual(1);
    expect(weeklyResp.body.review.summary).toContain("已纳入 PDF 诊断");
  });

  it("dismisses candidates", async () => {
    const { task } = await createPlan();
    const candidateResp = await request(app)
      .post("/api/feedback/candidates/generate")
      .send({
        daily_task_id: task.id,
        text: "这是一条不需要入库的普通问题",
      });
    expect(candidateResp.status).toBe(200);

    const dismissResp = await request(app)
      .patch(`/api/feedback/candidates/${candidateResp.body.candidate.id}`)
      .send({ status: "dismissed" });
    expect(dismissResp.status).toBe(200);
    expect(dismissResp.body.candidate.status).toBe("dismissed");
    expect(dismissResp.body.candidate.confirmed_at).toBeNull();
  });

  it("aggregates daily feedback and weekly review", async () => {
    const { task } = await createPlan();
    await request(app)
      .patch(`/api/planner/task/${task.id}/feedback`)
      .send({
        actual_minutes: 50,
        difficulty: "hard",
        focus: "focused",
        note: "复盘了增长率",
      })
      .expect(200);

    const candidateResp = await request(app)
      .post("/api/feedback/candidates/generate")
      .send({
        daily_task_id: task.id,
        text: "资料分析计算错题",
        hint: "计算错了",
      })
      .expect(200);
    await request(app)
      .patch(`/api/feedback/candidates/${candidateResp.body.candidate.id}`)
      .send({ status: "confirmed", cause: "计算过程不稳" })
      .expect(200);

    const dailyResp = await request(app).get(`/api/feedback/daily?date=${task.date}`);
    expect(dailyResp.status).toBe(200);
    expect(dailyResp.body.stats.actual_minutes).toBeGreaterThanOrEqual(50);
    expect(dailyResp.body.stats.confirmed_error_count).toBeGreaterThanOrEqual(1);
    expect(dailyResp.body.confirmed_errors.length).toBeGreaterThanOrEqual(1);

    const weeklyResp = await request(app)
      .post("/api/feedback/weekly")
      .send({
        week_start: task.date,
        week_end: task.date,
        regenerate: true,
      });
    expect(weeklyResp.status).toBe(200);
    expect(weeklyResp.body.review.scope).toBe("weekly");
    expect(weeklyResp.body.review.stats.actual_minutes).toBeGreaterThanOrEqual(50);
    expect(weeklyResp.body.review.summary).toContain("# 本周复盘");
    expect(weeklyResp.body.review.summary).toContain("## 3. 言语复盘数据整理");
    expect(weeklyResp.body.review.summary).toContain("| 错题 |");

    const getWeeklyResp = await request(app).get(`/api/feedback/weekly?week_start=${task.date}`);
    expect(getWeeklyResp.status).toBe(200);
    expect(getWeeklyResp.body.review.id).toBe(weeklyResp.body.review.id);
  });
});
