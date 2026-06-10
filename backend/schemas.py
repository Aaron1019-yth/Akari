from __future__ import annotations

from datetime import date as Date
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

GoalStatus = Literal["active", "completed", "paused", "archived"]
TrackType = Literal["xingce", "shenlun", "interview"]
TaskType = Literal["study", "practice", "mock_exam", "review", "essay"]
TimeSlot = Literal["morning", "afternoon", "evening"]
TaskStatus = Literal["pending", "in_progress", "completed", "skipped"]
UiTheme = Literal["agent_warm_paper", "akari_cool", "classic_beige"]


class ModuleOut(BaseModel):
    id: str
    track_id: str
    name: str
    sort_order: int
    weight: float
    correct_rate: float
    total_questions: int
    proficiency: float

    model_config = {"from_attributes": True}


class TrackOut(BaseModel):
    id: str
    goal_id: str
    type: TrackType
    title: str
    target_score: int
    current_score: int
    sort_order: int
    modules: list[ModuleOut] = []

    model_config = {"from_attributes": True}


class DailyTaskOut(BaseModel):
    id: str
    weekly_plan_id: str
    module_id: str
    date: Date
    title: str
    type: TaskType
    subject: str
    question_count: int
    estimated_minutes: int
    actual_minutes: int
    time_slot: TimeSlot
    status: TaskStatus
    sort_order: int

    model_config = {"from_attributes": True}


class WeeklyPlanOut(BaseModel):
    id: str
    goal_id: str
    week_start: Date
    week_end: Date
    focus_areas: list[str]
    target_correct_rate: float
    summary: str
    tasks: list[DailyTaskOut]


class StudentProfileOut(BaseModel):
    id: str
    goal_id: str
    strengths: list[str] = []
    weaknesses: list[str] = []
    module_proficiencies: dict[str, float] = {}
    preferred_time_slots: list[str] = []
    avg_daily_study_minutes: int
    learning_style: str
    last_updated: datetime

    model_config = {"from_attributes": True}


class GoalTree(BaseModel):
    id: str
    title: str
    description: str
    target_score: int
    current_estimated_score: int
    exam_date: Date
    created_at: datetime
    status: GoalStatus
    tracks: list[TrackOut]
    weekly_plan: WeeklyPlanOut | None
    profile: StudentProfileOut | None


class GeneratePlanRequest(BaseModel):
    target_score: int = Field(ge=1, le=300)
    exam_date: Date
    strengths: list[str] = []
    weaknesses: list[str] = []


class TaskPatchRequest(BaseModel):
    status: TaskStatus | None = None
    actual_minutes: int | None = Field(default=None, ge=0)
    time_slot: TimeSlot | None = None
    sort_order: int | None = None
    title: str | None = Field(default=None, min_length=1)
    type: TaskType | None = None
    subject: str | None = None
    estimated_minutes: int | None = Field(default=None, ge=0)
    date: Date | None = None


class TaskCreateRequest(BaseModel):
    title: str = Field(min_length=1)
    type: TaskType
    subject: str
    estimated_minutes: int = Field(ge=0)
    question_count: int = Field(default=0, ge=0)
    time_slot: TimeSlot
    date: Date | None = None
    module_id: str | None = None


class TodayTasksResponse(BaseModel):
    date: Date
    tasks: list[DailyTaskOut]


class PracticeSessionRequest(BaseModel):
    daily_task_id: str
    module_id: str
    question_count: int = Field(gt=0)
    correct_count: int = Field(ge=0)
    duration_seconds: int = Field(ge=0)
    tags: list[str] = []


class PracticeSessionOut(BaseModel):
    id: str
    daily_task_id: str
    module_id: str
    started_at: datetime
    ended_at: datetime
    question_count: int
    correct_count: int
    accuracy: float
    duration_seconds: int
    tags: list[str]


class PracticeSessionResponse(BaseModel):
    session: PracticeSessionOut
    task: DailyTaskOut
    module: ModuleOut
    profile: StudentProfileOut | None


class ErrorInput(BaseModel):
    module_id: str
    question_text: str
    user_answer: str
    correct_answer: str
    explanation: str = ""
    tags: list[str] = []


class ErrorBatchRequest(BaseModel):
    practice_session_id: str
    errors: list[ErrorInput]


class ErrorBatchResponse(BaseModel):
    created_count: int
    skipped_count: int
    profile: StudentProfileOut | None


class ChatRequest(BaseModel):
    session_id: str = "default"
    message: str = Field(min_length=1)


class ChatMessageOut(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime


class ChatResponse(BaseModel):
    session_id: str
    message: ChatMessageOut


class LlmSettingsOut(BaseModel):
    api_key_masked: str
    api_key_is_set: bool
    base_url: str
    model: str
    tavily_api_key_masked: str = ""
    tavily_api_key_is_set: bool = False
    serper_api_key_masked: str = ""
    serper_api_key_is_set: bool = False
    brave_search_api_key_masked: str = ""
    brave_search_api_key_is_set: bool = False
    ui_theme: UiTheme = "agent_warm_paper"


class LlmSettingsUpdate(BaseModel):
    api_key: str = ""
    base_url: str
    model: str
    tavily_api_key: str = ""
    serper_api_key: str = ""
    brave_search_api_key: str = ""
    ui_theme: UiTheme = "agent_warm_paper"
