import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../main.js";
import { createPlannerTools } from "../services/tools/planner.js";
import { toAppDateString } from "../services/date-utils.js";

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

describe("planner active-goal task scope", () => {
  it("does not mix archived tasks into today and week queries", async () => {
    await generatePlan(["资料分析"]);
    const active = await generatePlan(["数量关系"]);

    const today = toAppDateString();
    const todayResp = await request(app).get("/api/planner/today");
    expect(todayResp.status).toBe(200);
    expect(todayResp.body.date).toBe(today);
    expect(todayResp.body.tasks.length).toBe(1);
    expect(todayResp.body.tasks[0].title).toContain("数量关系");

    const weekTool = createPlannerTools().find((tool) => tool.name === "get_week_tasks");
    expect(weekTool).toBeTruthy();
    const result = await weekTool!.execute({ week_start: active.weekly_plan.week_start });
    expect(result.ok).toBe(true);
    expect(result.content).toContain("数量关系专项训练");
    expect(result.content).not.toContain("资料分析专项训练");
  });
});
