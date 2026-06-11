import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../main.js";
import {
  IntentClassifier,
  Intent,
  clearSessionState,
} from "../services/intent.js";
import { validateGeneratedPlan } from "../services/tools/generate-plan.js";
import { appendMessage, loadRecentMessages, sessionPath } from "../services/chat-service.js";
import { getSettings, saveSettings } from "../services/settings-service.js";
import fs from "fs";

// ── Intent Classifier (unit tests — no HTTP client needed) ──

describe("Intent Classifier", () => {
  it("asks one missing field on first planning query", () => {
    // Matches: test_intent_classifier_asks_one_missing_field
    clearSessionState();
    const decision = new IntentClassifier().classify(
      "我想备考国考，帮我做计划"
    );
    expect(decision.intent).toBe(Intent.ASK);
    expect(decision.missing_field).toBe("target_exam");
    expect(decision.question).toContain("哪个省份");
  });

  it("allows unrelated chat during diagnostic", () => {
    // Matches: test_intent_classifier_allows_unrelated_chat_during_diagnostic
    clearSessionState();
    const classifier = new IntentClassifier();
    classifier.classify("我想备考国考，帮我做计划");
    const decision = classifier.classify("今天天气是什么");
    expect(decision.intent).toBe(Intent.CHAT);
  });

  it("state is session-scoped", () => {
    // Matches: test_intent_classifier_state_is_session_scoped
    const sessionA = "phase1_intent_a";
    const sessionB = "phase1_intent_b";
    clearSessionState(sessionA);
    clearSessionState(sessionB);

    const classifier = new IntentClassifier();
    classifier.classify("我想备考国考，帮我做计划", sessionA);
    const decision = classifier.classify("3小时", sessionB);
    expect(decision.intent).toBe(Intent.CHAT);

    clearSessionState(sessionA);
    clearSessionState(sessionB);
  });

  it("reaches plan when all diagnostic fields are complete", () => {
    // Matches: test_intent_classifier_reaches_plan_when_fields_complete
    const sessionId = "phase1_complete_plan";
    clearSessionState(sessionId);

    const classifier = new IntentClassifier();
    classifier.classify("我想备考国考，帮我做计划", sessionId);
    classifier.classify("地市级", sessionId);
    classifier.classify("每天3小时", sessionId);
    classifier.classify("行测正确率60%", sessionId);
    classifier.classify("资料分析和数量关系薄弱", sessionId);
    classifier.classify("在职备考", sessionId);
    const decision = classifier.classify("目标150分", sessionId);

    expect([Intent.PLAN, Intent.ADJUST]).toContain(decision.intent);
    expect(decision.pending_fields["daily_hours"]).toBe(3);
    expect(decision.pending_fields["target_exam"]).toBe("地市级");
    expect(decision.pending_fields["target_score"]).toBe(150);

    clearSessionState(sessionId);
  });
});

// ── File upload (HTTP test) ──

describe("File upload", () => {
  it("upload and list", async () => {
    // Matches: test_file_upload_and_list
    const resp = await request(app)
      .post("/api/workspace/upload")
      .attach(
        "file",
        Buffer.from("fake docx bytes"),
        {
          filename: "notes.docx",
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }
      );
    expect(resp.status).toBe(200);
    const uploaded = resp.body;
    expect(uploaded.file.name).toBe("notes.docx");

    const listed = await request(app).get("/api/workspace/tree");
    expect(listed.status).toBe(200);
    expect(
      listed.body.tree.some(
        (item: { name: string }) => item.name === uploaded.file.name
      )
    ).toBe(true);
  });
});

// ── Schema validation (unit test) ──

describe("Schema validation", () => {
  it("generate_plan rejects negative estimated_minutes", () => {
    // Matches: test_generate_plan_schema_validation
    const { error } = validateGeneratedPlan({
      week_start: new Date().toISOString().slice(0, 10),
      tasks: [
        {
          title: "资料分析速算训练",
          type: "practice",
          subject: "资料分析",
          estimated_minutes: -1,
          time_slot: "afternoon",
          date: new Date().toISOString().slice(0, 10),
        },
      ],
    });
    expect(error).toBeTruthy();
    expect(error).toContain("estimated_minutes");
  });
});

// ── Chat history (unit tests) ──

describe("Chat history", () => {
  it("loads recent messages", () => {
    // Matches: test_chat_history_loads_recent_messages
    const sessionId = "phase1_history_test";
    const p = sessionPath(sessionId);
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ok */ }

    appendMessage(sessionId, "user", "你好");
    appendMessage(sessionId, "assistant", "你好呀");
    const messages = loadRecentMessages(sessionId);
    expect(messages.map((m) => ({ role: m.role, content: m.content }))).toEqual([
      { role: "user", content: "你好" },
      { role: "assistant", content: "你好呀" },
    ]);

    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ok */ }
  });

  it("skips corrupt JSONL lines", () => {
    // Matches: test_chat_history_skips_corrupt_jsonl_lines
    const sessionId = "phase1_corrupt_history_test";
    const p = sessionPath(sessionId);

    fs.mkdirSync(p.replace(/[/\\][^/\\]+$/, ""), { recursive: true });
    fs.writeFileSync(
      p,
      '{"role":"user","content":"第一句"}\nnot-json\n{"role":"assistant","content":"第二句"}\n',
      "utf-8"
    );
    const messages = loadRecentMessages(sessionId);
    expect(messages.map((m) => ({ role: m.role, content: m.content }))).toEqual([
      { role: "user", content: "第一句" },
      { role: "assistant", content: "第二句" },
    ]);

    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ok */ }
  });

  it("deletes messages and diagnostic state", async () => {
    const sessionId = "phase1_delete_session_test";
    const p = sessionPath(sessionId);
    clearSessionState(sessionId);
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ok */ }

    appendMessage(sessionId, "user", "我想备考国考，帮我做计划");
    new IntentClassifier().classify("我想备考国考，帮我做计划", sessionId);

    const resp = await request(app).delete(`/api/sessions/${sessionId}`);
    expect(resp.status).toBe(200);
    expect(loadRecentMessages(sessionId)).toEqual([]);

    const decision = new IntentClassifier().classify("每天3小时", sessionId);
    expect(decision.intent).toBe(Intent.CHAT);

    clearSessionState(sessionId);
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ok */ }
  });
});

// ── Settings (HTTP test) ──

describe("Settings", () => {
  it("includes search provider keys in PUT response", async () => {
    // Matches: test_settings_include_search_provider_keys
    const original = getSettings();
    try {
      const resp = await request(app)
        .put("/api/settings")
        .send({
          api_key: original.apiKey,
          base_url: original.baseUrl,
          model: original.model,
          tavily_api_key: "tv-test-key",
          serper_api_key: "",
          brave_search_api_key: "",
          ui_theme: "agent_warm_paper",
        });
      expect(resp.status).toBe(200);
      const data = resp.body as Record<string, unknown>;
      expect(data.tavily_api_key_is_set).toBe(true);
      expect(typeof data.tavily_api_key_masked === "string").toBe(true);
      expect((data.tavily_api_key_masked as string).startsWith("tv-")).toBe(true);
    } finally {
      saveSettings(original);
    }
  });
});
