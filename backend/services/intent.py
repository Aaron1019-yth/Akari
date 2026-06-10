from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import json
from pathlib import Path
import re
from typing import Any

from backend.db.database import DATA_DIR, SessionLocal
from backend.services.planner_service import get_active_goal


SESSION_STATE_PATH = DATA_DIR / "session_state.json"
SESSION_STATE_DIR = DATA_DIR / "session_state"


class Intent(Enum):
    ASK = "ask"
    PLAN = "plan"
    ADJUST = "adjust"
    QUERY_PLAN = "query_plan"
    CHAT = "chat"


REQUIRED_FIELDS = [
    "exam_type",
    "target_exam",
    "daily_hours",
    "current_level",
    "weak_modules",
    "student_status",
    "target_score",
]

QUESTIONS = {
    "exam_type": "你想考国考、省考还是事业单位？",
    "target_exam": "你计划报考哪个省份或具体考试？",
    "daily_hours": "你每天大概能稳定学习几个小时？",
    "current_level": "你之前做过真题吗？行测正确率或申论分数大概是多少？",
    "weak_modules": "你觉得哪些模块比较薄弱？",
    "student_status": "你是在职备考、在校备考，还是全职备考？",
    "target_score": "你的目标分数是多少？",
}

ADJUST_KEYWORDS = [
    "任务太多", "任务太少", "没时间", "太难", "太简单",
    "太多了", "太少了", "调整", "改一下计划",
    "今天没时间", "今天不学", "今天请假",
    "我已经会了", "这个模块简单", "跳过",
]
QUERY_KEYWORDS = (
    "看看计划", "我的计划", "今天任务", "今日计划", "本周计划", "今天学什么",
    "今天有什么", "进度", "任务做得怎么样", "完成情况",
)
PLAN_KEYWORDS = (
    "计划", "规划", "备考", "学习安排", "怎么学", "帮我安排", "制定",
    "国考", "省考", "事业单位", "公考",
)
GREETING_KEYWORDS = {"你好", "您好", "hi", "hello", "嗨", "在吗"}

DIAGNOSTIC_FIELDS: list[dict] = [
    {"key": "exam_type", "question": "你想考国考、省考还是事业单位？", "priority": 1},
    {"key": "target_exam", "question": "你计划报考哪个省份？", "priority": 2},
    {"key": "daily_hours", "question": "你每天大概能学几个小时？", "priority": 3},
    {"key": "current_level", "question": "你之前做过真题吗？行测正确率大概多少？", "priority": 4},
    {"key": "weak_modules", "question": "你觉得哪些模块比较薄弱？", "priority": 5},
    {"key": "student_status", "question": "你是在职备考还是全职备考？", "priority": 6},
    {"key": "target_score", "question": "你的目标分数是多少？", "priority": 7},
]


@dataclass
class IntentDecision:
    intent: Intent
    question: str = ""
    missing_field: str | None = None
    pending_fields: dict[str, Any] = field(default_factory=dict)


def _safe_session_id(session_id: str) -> str:
    return "".join(char for char in session_id if char.isalnum() or char in ("-", "_")) or "default"


def session_state_path(session_id: str = "default") -> Path:
    if _safe_session_id(session_id) == "default":
        return SESSION_STATE_PATH
    return SESSION_STATE_DIR / f"{_safe_session_id(session_id)}.json"


def load_session_state(session_id: str = "default") -> dict[str, Any]:
    path = session_state_path(session_id)
    if not path.exists():
        return {"pending_fields": {}, "diagnostic_in_progress": False}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"pending_fields": {}, "diagnostic_in_progress": False}
    data.setdefault("pending_fields", {})
    data.setdefault("diagnostic_in_progress", False)
    return data


def save_session_state(state: dict[str, Any], session_id: str = "default") -> None:
    path = session_state_path(session_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def clear_session_state(session_id: str = "default") -> None:
    session_state_path(session_id).unlink(missing_ok=True)


def _has_active_goal() -> bool:
    db = SessionLocal()
    try:
        return get_active_goal(db) is not None
    finally:
        db.close()


def _planning_intent(text: str) -> bool:
    return any(keyword in text for keyword in PLAN_KEYWORDS)


def _looks_like_diagnostic_answer(text: str, extracted_fields: dict[str, Any]) -> bool:
    if extracted_fields:
        return True
    if re.search(r"\d+(?:\.\d+)?\s*(?:个?小时|h|分|%)", text):
        return True
    return any(word in text for word in ("做过", "没做过", "真题", "薄弱", "弱", "强", "基础", "正确率"))


def _extract_fields(text: str) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    if "国考" in text:
        fields["exam_type"] = "国考"
    elif "省考" in text:
        fields["exam_type"] = "省考"
    elif "事业单位" in text:
        fields["exam_type"] = "事业单位"

    province = re.search(r"(北京|上海|天津|重庆|广东|江苏|浙江|山东|河南|四川|湖北|湖南|福建|安徽|河北|山西|陕西|江西|广西|云南|贵州|辽宁|吉林|黑龙江|海南|甘肃|青海|宁夏|新疆|西藏|内蒙古)", text)
    if province:
        fields["target_exam"] = f"{province.group(1)}省考" if fields.get("exam_type") == "省考" else province.group(1)
    exam_track = re.search(r"(副省级|地市级|行政执法|市地级|县乡)", text)
    if exam_track:
        fields["target_exam"] = exam_track.group(1)

    hours = re.search(r"(?:每天|每日)?\s*(\d+(?:\.\d+)?)\s*(?:个?小时|h)", text)
    if hours:
        fields["daily_hours"] = float(hours.group(1))

    score = re.search(r"(?:目标|想考|冲刺)?\s*(\d{2,3})\s*分", text)
    if score:
        fields["target_score"] = int(score.group(1))

    level = re.search(r"(正确率|行测).*?(\d{1,3})\s*%?", text)
    if level:
        fields["current_level"] = level.group(0)

    weak = [name for name in ("资料分析", "数量关系", "言语理解", "判断推理", "常识判断", "申论", "申论作文") if name in text]
    if weak:
        fields["weak_modules"] = weak

    for status in ("在职", "全职", "在校"):
        if status in text:
            fields["student_status"] = status
            break
    return fields


class IntentClassifier:
    def classify(self, text: str, session_id: str = "default") -> IntentDecision:
        normalized = text.strip().lower().strip("。！!？?~ ")
        if normalized in GREETING_KEYWORDS:
            state = load_session_state(session_id)
            return IntentDecision(Intent.CHAT, pending_fields=dict(state.get("pending_fields") or {}))

        state = load_session_state(session_id)
        pending = dict(state.get("pending_fields") or {})
        extracted = _extract_fields(text)
        pending.update(extracted)
        has_goal = _has_active_goal()

        if has_goal and any(keyword in text for keyword in ADJUST_KEYWORDS):
            save_session_state({**state, "pending_fields": pending}, session_id)
            return IntentDecision(Intent.ADJUST, pending_fields=pending)

        if any(keyword in text for keyword in QUERY_KEYWORDS):
            save_session_state({**state, "pending_fields": pending}, session_id)
            return IntentDecision(Intent.QUERY_PLAN, pending_fields=pending)

        continuing_diagnostic = state.get("diagnostic_in_progress") and _looks_like_diagnostic_answer(text, extracted)
        if _planning_intent(text) or continuing_diagnostic:
            missing_entry = next((f for f in DIAGNOSTIC_FIELDS if not pending.get(f["key"])), None)
            if missing_entry:
                save_session_state({"pending_fields": pending, "diagnostic_in_progress": True}, session_id)
                return IntentDecision(Intent.ASK, question=missing_entry["question"], missing_field=missing_entry["key"], pending_fields=pending)
            save_session_state({"pending_fields": pending, "diagnostic_in_progress": False}, session_id)
            if not has_goal:
                return IntentDecision(Intent.PLAN, pending_fields=pending)
            return IntentDecision(Intent.ADJUST, pending_fields=pending)

        save_session_state({**state, "pending_fields": pending}, session_id)
        return IntentDecision(Intent.CHAT, pending_fields=pending)
