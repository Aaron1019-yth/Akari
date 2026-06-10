import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../main.js";

// ── Integration smoke test ──
// Matches: test_generate_plan_and_record_practice

describe("Backend smoke", () => {
  it("generate plan, record practice, CRUD task, and chat (if key)", async () => {
    // ── Generate plan ──
    const examDate = new Date();
    examDate.setDate(examDate.getDate() + 120);

    const goalResp = await request(app)
      .post("/api/planner/generate")
      .send({
        target_score: 150,
        exam_date: examDate.toISOString().slice(0, 10),
        strengths: ["言语理解与表达"],
        weaknesses: ["资料分析"],
      });
    expect(goalResp.status).toBe(200);
    const goal = goalResp.body;
    expect(goal.title).toBe("Akari 公考备考计划");
    expect(goal.weekly_plan.tasks.length).toBeGreaterThan(0);

    // ── Record practice session ──
    const task = goal.weekly_plan.tasks[0];
    const practiceResp = await request(app)
      .post("/api/practice/session")
      .send({
        daily_task_id: task.id,
        module_id: task.module_id,
        question_count: 30,
        correct_count: 21,
        duration_seconds: 1800,
        tags: ["增长率"],
      });
    expect(practiceResp.status).toBe(200);
    const practice = practiceResp.body;
    expect(practice.session.accuracy).toBe(0.7);
    expect(practice.task.status).toBe("completed");

    // ── Create task ──
    const createResp = await request(app)
      .post("/api/planner/task")
      .send({
        title: "资料复盘",
        type: "review",
        subject: "资料分析",
        estimated_minutes: 25,
        time_slot: "evening",
        date: new Date().toISOString().slice(0, 10),
      });
    expect(createResp.status).toBe(200);
    const createdGoal = createResp.body;
    const createdTask = createdGoal.weekly_plan.tasks.find(
      (t: { title: string }) => t.title === "资料复盘"
    );
    expect(createdTask).toBeDefined();
    expect(createdTask.status).toBe("pending");
    expect(createdTask.time_slot).toBe("evening");

    // ── Patch task (status + actual_minutes) ──
    const patchResp = await request(app)
      .patch(`/api/planner/task/${createdTask.id}`)
      .send({ status: "completed", actual_minutes: 12 });
    expect(patchResp.status).toBe(200);
    const patchedGoal = patchResp.body;
    const patchedTask = patchedGoal.weekly_plan.tasks.find(
      (t: { id: string }) => t.id === createdTask.id
    );
    expect(patchedTask.status).toBe("completed");
    expect(patchedTask.actual_minutes).toBe(12);

    // ── Patch task (title + estimated_minutes) ──
    const editResp = await request(app)
      .patch(`/api/planner/task/${createdTask.id}`)
      .send({ title: "资料复盘修订版", estimated_minutes: 40 });
    expect(editResp.status).toBe(200);
    const editedGoal = editResp.body;
    const editedTask = editedGoal.weekly_plan.tasks.find(
      (t: { id: string }) => t.id === createdTask.id
    );
    expect(editedTask.title).toBe("资料复盘修订版");
    expect(editedTask.estimated_minutes).toBe(40);

    // ── Delete task ──
    const deleteResp = await request(app).delete(
      `/api/planner/task/${createdTask.id}`
    );
    expect(deleteResp.status).toBe(200);
    const deletedGoal = deleteResp.body;
    const taskStillExists = deletedGoal.weekly_plan.tasks.some(
      (t: { id: string }) => t.id === createdTask.id
    );
    expect(taskStillExists).toBe(false);

    // ── Chat (only when API key is set) ──
    if (process.env.DEEPSEEK_API_KEY) {
      const chatResp = await request(app)
        .post("/api/chat")
        .send({ session_id: "smoke", message: "今天怎么复盘资料分析？" });
      expect(chatResp.status).toBe(200);
      const chat = chatResp.body;
      expect(chat.session_id).toBe("smoke");
      expect(chat.message.role).toBe("assistant");
      expect(chat.message.content.length).toBeGreaterThan(0);
    }
  });
});
