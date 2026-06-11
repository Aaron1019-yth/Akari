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

    const getWeeklyResp = await request(app).get(`/api/feedback/weekly?week_start=${task.date}`);
    expect(getWeeklyResp.status).toBe(200);
    expect(getWeeklyResp.body.review.id).toBe(weeklyResp.body.review.id);
  });
});
