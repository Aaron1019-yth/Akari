from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    target_score: Mapped[int] = mapped_column(Integer, nullable=False)
    current_estimated_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    exam_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)

    tracks: Mapped[list["Track"]] = relationship(back_populates="goal", cascade="all, delete-orphan")
    weekly_plans: Mapped[list["WeeklyPlan"]] = relationship(back_populates="goal", cascade="all, delete-orphan")
    profile: Mapped["StudentProfile | None"] = relationship(back_populates="goal", cascade="all, delete-orphan")


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    goal_id: Mapped[str] = mapped_column(ForeignKey("goals.id"), nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    target_score: Mapped[int] = mapped_column(Integer, nullable=False)
    current_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)

    goal: Mapped[Goal] = relationship(back_populates="tracks")
    modules: Mapped[list["Module"]] = relationship(back_populates="track", cascade="all, delete-orphan")


class Module(Base):
    __tablename__ = "modules"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    track_id: Mapped[str] = mapped_column(ForeignKey("tracks.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    correct_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    proficiency: Mapped[float] = mapped_column(Float, nullable=False, default=0)

    track: Mapped[Track] = relationship(back_populates="modules")


class WeeklyPlan(Base):
    __tablename__ = "weekly_plans"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    goal_id: Mapped[str] = mapped_column(ForeignKey("goals.id"), nullable=False)
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    week_end: Mapped[date] = mapped_column(Date, nullable=False)
    focus_areas_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    target_correct_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")

    goal: Mapped[Goal] = relationship(back_populates="weekly_plans")
    tasks: Mapped[list["DailyTask"]] = relationship(back_populates="weekly_plan", cascade="all, delete-orphan")


class DailyTask(Base):
    __tablename__ = "daily_tasks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    weekly_plan_id: Mapped[str] = mapped_column(ForeignKey("weekly_plans.id"), nullable=False)
    module_id: Mapped[str] = mapped_column(ForeignKey("modules.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    subject: Mapped[str] = mapped_column(String, nullable=False)
    question_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    estimated_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    actual_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    time_slot: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)

    weekly_plan: Mapped[WeeklyPlan] = relationship(back_populates="tasks")
    module: Mapped[Module] = relationship()


class PracticeSession(Base):
    __tablename__ = "practice_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    daily_task_id: Mapped[str] = mapped_column(ForeignKey("daily_tasks.id"), nullable=False)
    module_id: Mapped[str] = mapped_column(ForeignKey("modules.id"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ended_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    question_count: Mapped[int] = mapped_column(Integer, nullable=False)
    correct_count: Mapped[int] = mapped_column(Integer, nullable=False)
    accuracy: Mapped[float] = mapped_column(Float, nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    tags_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")


class ErrorRecord(Base):
    __tablename__ = "error_records"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    practice_session_id: Mapped[str] = mapped_column(ForeignKey("practice_sessions.id"), nullable=False)
    module_id: Mapped[str] = mapped_column(ForeignKey("modules.id"), nullable=False)
    question_hash: Mapped[str] = mapped_column(String, nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    user_answer: Mapped[str] = mapped_column(Text, nullable=False)
    correct_answer: Mapped[str] = mapped_column(Text, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False, default="")
    tags_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    recorded_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    reviewed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    mastered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class StudentProfile(Base):
    __tablename__ = "student_profiles"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    goal_id: Mapped[str] = mapped_column(ForeignKey("goals.id"), nullable=False, unique=True)
    strengths_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    weaknesses_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    module_proficiencies_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    preferred_time_slots_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    avg_daily_study_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    learning_style: Mapped[str] = mapped_column(String, nullable=False, default="")
    last_updated: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    goal: Mapped[Goal] = relationship(back_populates="profile")
