from __future__ import annotations

from datetime import date

from backend.services.chat_service import append_message, load_recent_messages, session_path
from backend.services.intent import Intent, IntentClassifier, SESSION_STATE_PATH, clear_session_state, session_state_path
from backend.services.settings_service import get_settings, save_settings
from backend.services.tools.generate_plan import validate_generated_plan


def test_intent_classifier_asks_one_missing_field() -> None:
    SESSION_STATE_PATH.unlink(missing_ok=True)
    decision = IntentClassifier().classify("我想备考国考，帮我做计划")
    assert decision.intent == Intent.ASK
    assert decision.missing_field == "target_exam"
    assert "哪个省份" in decision.question


def test_intent_classifier_allows_unrelated_chat_during_diagnostic() -> None:
    SESSION_STATE_PATH.unlink(missing_ok=True)
    IntentClassifier().classify("我想备考国考，帮我做计划")
    decision = IntentClassifier().classify("今天天气是什么")
    assert decision.intent == Intent.CHAT


def test_intent_classifier_state_is_session_scoped() -> None:
    session_a = "phase1_intent_a"
    session_b = "phase1_intent_b"
    session_state_path(session_a).unlink(missing_ok=True)
    session_state_path(session_b).unlink(missing_ok=True)
    IntentClassifier().classify("我想备考国考，帮我做计划", session_id=session_a)
    decision = IntentClassifier().classify("3小时", session_id=session_b)
    assert decision.intent == Intent.CHAT
    session_state_path(session_a).unlink(missing_ok=True)
    session_state_path(session_b).unlink(missing_ok=True)


def test_intent_classifier_reaches_plan_when_fields_complete() -> None:
    session_id = "phase1_complete_plan"
    clear_session_state(session_id)
    classifier = IntentClassifier()
    classifier.classify("我想备考国考，帮我做计划", session_id=session_id)
    classifier.classify("地市级", session_id=session_id)
    classifier.classify("每天3小时", session_id=session_id)
    classifier.classify("行测正确率60%", session_id=session_id)
    classifier.classify("资料分析和数量关系薄弱", session_id=session_id)
    classifier.classify("在职备考", session_id=session_id)
    decision = classifier.classify("目标150分", session_id=session_id)
    assert decision.intent in {Intent.PLAN, Intent.ADJUST}
    assert decision.pending_fields["daily_hours"] == 3
    assert decision.pending_fields["target_exam"] == "地市级"
    assert decision.pending_fields["target_score"] == 150
    clear_session_state(session_id)


def test_file_upload_and_list(client) -> None:
    response = client.post(
        "/api/files/upload",
        files={"file": ("notes.docx", b"fake docx bytes", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert response.status_code == 200
    uploaded = response.json()
    assert uploaded["filename"] == "notes.docx"

    listed = client.get("/api/files")
    assert listed.status_code == 200
    assert any(item["file_id"] == uploaded["file_id"] for item in listed.json()["files"])


def test_generate_plan_schema_validation() -> None:
    _, error = validate_generated_plan({
        "week_start": str(date.today()),
        "tasks": [{
            "title": "资料分析速算训练",
            "type": "practice",
            "subject": "资料分析",
            "estimated_minutes": -1,
            "time_slot": "afternoon",
            "date": str(date.today()),
        }],
    })
    assert error
    assert "estimated_minutes" in error


def test_chat_history_loads_recent_messages() -> None:
    session_id = "phase1_history_test"
    session_path(session_id).unlink(missing_ok=True)
    append_message(session_id, "user", "你好")
    append_message(session_id, "assistant", "你好呀")
    messages = load_recent_messages(session_id)
    assert [(m.role, m.content) for m in messages] == [("user", "你好"), ("assistant", "你好呀")]
    session_path(session_id).unlink(missing_ok=True)


def test_chat_history_skips_corrupt_jsonl_lines() -> None:
    session_id = "phase1_corrupt_history_test"
    path = session_path(session_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('{"role":"user","content":"第一句"}\nnot-json\n{"role":"assistant","content":"第二句"}\n', encoding="utf-8")
    messages = load_recent_messages(session_id)
    assert [(m.role, m.content) for m in messages] == [("user", "第一句"), ("assistant", "第二句")]
    path.unlink(missing_ok=True)


def test_settings_include_search_provider_keys(client) -> None:
    original = get_settings()
    try:
        response = client.put(
            "/api/settings",
            json={
                "api_key": original.api_key,
                "base_url": original.base_url,
                "model": original.model,
                "tavily_api_key": "tv-test-key",
                "serper_api_key": "",
                "brave_search_api_key": "",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["tavily_api_key_is_set"] is True
        assert data["tavily_api_key_masked"].startswith("tv-")
    finally:
        save_settings(original)
