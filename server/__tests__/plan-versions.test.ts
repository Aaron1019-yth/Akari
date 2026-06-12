import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../main.js";
import { readFile } from "../services/workspace-service.js";

async function generatePlan(weaknesses: string[]) {
  const resp = await request(app)
    .post("/api/planner/generate")
    .send({
      target_score: 150,
      exam_date: "2026-12-01",
      strengths: [],
      weaknesses,
    });
  expect(resp.status).toBe(200);
  return resp.body;
}

describe("plan versions", () => {
  it("creates a manual plan and updates active goal metadata", async () => {
    const manualResp = await request(app)
      .post("/api/planner/manual")
      .send({
        title: "手动言语复盘计划",
        description: "先按自己的节奏整理任务。",
        target_score: 150,
        exam_date: "2026-12-01",
      });

    expect(manualResp.status).toBe(200);
    expect(manualResp.body.title).toBe("手动言语复盘计划");
    expect(manualResp.body.weekly_plan.tasks).toEqual([]);
    expect(manualResp.body.tracks.length).toBeGreaterThan(0);

    const patchResp = await request(app)
      .patch("/api/planner/goal")
      .send({
        title: "更新后的手动计划",
        description: "改成言语和资料双线推进。",
      });

    expect(patchResp.status).toBe(200);
    expect(patchResp.body.title).toBe("更新后的手动计划");
    expect(patchResp.body.description).toBe("改成言语和资料双线推进。");
  });

  it("lists and restores archived plans", async () => {
    const first = await generatePlan(["资料分析"]);
    const second = await generatePlan(["数量关系"]);
    expect(first.id).not.toBe(second.id);

    const versionsResp = await request(app).get("/api/planner/versions");
    expect(versionsResp.status).toBe(200);
    expect(versionsResp.body.versions.length).toBeGreaterThanOrEqual(2);
    expect(versionsResp.body.versions[0].goal_id).toBe(second.id);
    expect(versionsResp.body.versions[0].status).toBe("active");
    expect(
      versionsResp.body.versions.some(
        (version: { goal_id: string; status: string; task_count: number }) =>
          version.goal_id === first.id && version.status === "archived" && version.task_count > 0
      )
    ).toBe(true);

    const restoreResp = await request(app).post(`/api/planner/versions/${first.id}/restore`);
    expect(restoreResp.status).toBe(200);
    expect(restoreResp.body.goal.id).toBe(first.id);
    expect(restoreResp.body.document_path).toBe("plans/current-plan.md");

    const goalResp = await request(app).get("/api/planner/goal");
    expect(goalResp.status).toBe(200);
    expect(goalResp.body.id).toBe(first.id);

    const doc = await readFile("plans/current-plan.md");
    expect(doc.content).toContain(first.id);
    expect(doc.content).toContain("资料分析");
  });

  it("syncs active plan document on demand", async () => {
    const plan = await generatePlan(["判断推理"]);
    const syncResp = await request(app).post("/api/planner/document/sync");
    expect(syncResp.status).toBe(200);
    expect(syncResp.body.document_path).toBe("plans/current-plan.md");

    const doc = await readFile("plans/current-plan.md");
    expect(doc.content).toContain(plan.id);
    expect(doc.content).toContain("判断推理");
  });

  it("archives the active plan and then allows deleting it", async () => {
    const plan = await generatePlan(["言语理解"]);

    const deleteActiveResp = await request(app).delete(`/api/planner/versions/${plan.id}`);
    expect(deleteActiveResp.status).toBe(409);

    const archiveResp = await request(app).post(`/api/planner/versions/${plan.id}/archive`);
    expect(archiveResp.status).toBe(200);
    expect(archiveResp.body.goal).toBeNull();
    expect(archiveResp.body.versions.some((version: { goal_id: string; status: string }) => version.goal_id === plan.id && version.status === "archived")).toBe(true);

    const goalResp = await request(app).get("/api/planner/goal");
    expect(goalResp.status).toBe(200);
    expect(goalResp.body).toBeNull();

    const deleteResp = await request(app).delete(`/api/planner/versions/${plan.id}`);
    expect(deleteResp.status).toBe(200);
    expect(deleteResp.body.deleted_goal_id).toBe(plan.id);
    expect(deleteResp.body.versions.some((version: { goal_id: string }) => version.goal_id === plan.id)).toBe(false);

    const versionsResp = await request(app).get("/api/planner/versions");
    expect(versionsResp.body.versions.some((version: { goal_id: string }) => version.goal_id === plan.id)).toBe(false);
  });

  it("returns 404 when deleting a missing plan version", async () => {
    const resp = await request(app).delete("/api/planner/versions/missing-goal");
    expect(resp.status).toBe(404);
  });
});
