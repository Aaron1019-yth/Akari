import { Check, Clock3, Plus, Trash2, X } from "lucide-react";
import { useState, type DragEvent } from "react";
import type { DailyTask, ErrorCandidate, FileNode, GoalTree, PlanVersionSummary, TaskDifficulty, TaskFocus, TaskStatus, TaskType, TimeSlot } from "../../../../../shared/exam-schema";
import type { DailyFeedbackResponse, WeeklyReviewResponse } from "../../services/types";
import { formatAppDate, shortDate, slotLabel, taskTypeOptions } from "../../utils";
import { FilePreview } from "../workspace/FilePreview";
import { FileTree } from "../workspace/FileTree";

interface WorkbenchProps {
  activeWorkbenchTab: "plan" | "review" | "workspace";
  onTabChange: (tab: "plan" | "review" | "workspace") => void;
  fileTree: FileNode[];
  selectedPath: string | null;
  previewContent: string | null;
  previewMime: string;
  previewSize: number;
  previewLoading: boolean;
  onFileSelect: (path: string) => void;
  onFileDelete: (path: string) => void;
  onFileRename: (path: string) => void;
  readingFile: boolean;
  onExitReading: () => void;
  goal: GoalTree | null;
  daysLeft: number;
  planProgress: number;
  todaySummary: { completed: number; total: number };
  weeklySummary: { completedCount: number; totalCount: number; completedMinutes: number; range: string };
  planVersions: PlanVersionSummary[];
  planVersionsLoading: boolean;
  planVersionsError: string | null;
  restoringPlanId: string | null;
  errorCandidates: ErrorCandidate[];
  wrongQuestionText: string;
  candidateLoading: boolean;
  candidateError: string | null;
  updatingCandidateId: string | null;
  dailyFeedback: DailyFeedbackResponse | null;
  weeklyReview: WeeklyReviewResponse["review"];
  reviewLoading: boolean;
  reviewError: string | null;
  onOpenPlanDocument: () => void;
  onRefreshPlanVersions: () => void;
  onRestorePlanVersion: (goalId: string) => void;
  onWrongQuestionTextChange: (text: string) => void;
  onGenerateCandidate: () => void;
  onGenerateCandidateFromCurrentFile: () => void;
  onRefreshCandidates: () => void;
  onConfirmCandidate: (candidate: ErrorCandidate) => void;
  onDismissCandidate: (candidate: ErrorCandidate) => void;
  onRefreshStudyReview: () => void;
  onGenerateWeeklyReview: () => void;
  viewMode: "today" | "week";
  onViewModeChange: (mode: "today" | "week") => void;
  draftSlot: TimeSlot | null;
  draftTitle: string;
  draftType: TaskType;
  draftMinutes: number;
  onDraftSlotChange: (slot: TimeSlot | null) => void;
  onDraftTitleChange: (title: string) => void;
  onDraftTypeChange: (type: TaskType) => void;
  onDraftMinutesChange: (minutes: number) => void;
  groupedTasks: Record<TimeSlot, DailyTask[]>;
  weekDays: Array<{ label: string; date: string }>;
  onUpdateTask: (task: DailyTask, status: TaskStatus) => void;
  onSaveTaskFeedback: (task: DailyTask, payload: { actual_minutes: number; difficulty: TaskDifficulty; focus: TaskFocus; note: string }) => void;
  onEditTask: (task: DailyTask, patch: { title?: string; type?: TaskType; estimated_minutes?: number }) => void;
  onDeleteTask: (task: DailyTask) => void;
  onMoveTask: (task: DailyTask, target: { date: string; time_slot: TimeSlot; beforeTaskId?: string; afterTaskId?: string }) => void;
  onAddTask: (slot: TimeSlot) => void;
  onOpenDraft: (slot: TimeSlot) => void;
  onOpenTimer: (task: DailyTask) => void;
  timerTask: DailyTask | null;
  timerMode: "countdown" | "countup";
  timerMinutes: number;
  timerRunning: boolean;
  timerElapsedSeconds: number;
  timerDisplay: string;
  onTimerModeChange: (mode: "countdown" | "countup") => void;
  onTimerMinutesChange: (minutes: number) => void;
  onTimerStartStop: () => void;
  onRecordTimer: () => void;
  onCloseTimer: () => void;
}

export function Workbench({
  activeWorkbenchTab,
  onTabChange,
  fileTree,
  selectedPath,
  previewContent,
  previewMime,
  previewSize,
  previewLoading,
  onFileSelect,
  onFileDelete,
  onFileRename,
  readingFile,
  onExitReading,
  goal,
  daysLeft,
  planProgress,
  todaySummary,
  weeklySummary,
  planVersions,
  planVersionsLoading,
  planVersionsError,
  restoringPlanId,
  errorCandidates,
  wrongQuestionText,
  candidateLoading,
  candidateError,
  updatingCandidateId,
  dailyFeedback,
  weeklyReview,
  reviewLoading,
  reviewError,
  onOpenPlanDocument,
  onRefreshPlanVersions,
  onRestorePlanVersion,
  onWrongQuestionTextChange,
  onGenerateCandidate,
  onGenerateCandidateFromCurrentFile,
  onRefreshCandidates,
  onConfirmCandidate,
  onDismissCandidate,
  onRefreshStudyReview,
  onGenerateWeeklyReview,
  viewMode,
  onViewModeChange,
  draftSlot,
  draftTitle,
  draftType,
  draftMinutes,
  onDraftSlotChange,
  onDraftTitleChange,
  onDraftTypeChange,
  onDraftMinutesChange,
  groupedTasks,
  weekDays,
  onUpdateTask,
  onSaveTaskFeedback,
  onEditTask,
  onDeleteTask,
  onMoveTask,
  onAddTask,
  onOpenDraft,
  onOpenTimer,
  timerTask,
  timerMode,
  timerMinutes,
  timerRunning,
  timerElapsedSeconds,
  timerDisplay,
  onTimerModeChange,
  onTimerMinutesChange,
  onTimerStartStop,
  onRecordTimer,
  onCloseTimer,
}: WorkbenchProps) {
  const [draggingTask, setDraggingTask] = useState<DailyTask | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  function allowDrop(event: DragEvent) {
    if (!draggingTask) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function dropOnEmpty(date: string, timeSlot: TimeSlot) {
    if (!draggingTask) return;
    onMoveTask(draggingTask, { date, time_slot: timeSlot });
    setDraggingTask(null);
    setDragOverKey(null);
  }

  function dropOnTask(event: DragEvent, targetTask: DailyTask) {
    if (!draggingTask || draggingTask.id === targetTask.id) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const beforeTaskId = event.clientY < rect.top + rect.height / 2 ? targetTask.id : undefined;
    const afterTaskId = beforeTaskId ? undefined : targetTask.id;
    onMoveTask(draggingTask, { date: targetTask.date, time_slot: targetTask.time_slot, beforeTaskId, afterTaskId });
    setDraggingTask(null);
    setDragOverKey(null);
  }

  return (
    <aside className="workbench">
      <div className="workbench-title">
        <strong>OH-WorkSpace</strong>
      </div>
      <div className="panel-heading">
        <button className={activeWorkbenchTab === "plan" ? "active" : ""} onClick={() => onTabChange("plan")}>我的规划</button>
        <button className={activeWorkbenchTab === "review" ? "active" : ""} onClick={() => onTabChange("review")}>复盘错题</button>
        <button className={activeWorkbenchTab === "workspace" ? "active" : ""} onClick={() => onTabChange("workspace")}>工作台</button>
      </div>
      {activeWorkbenchTab === "workspace" ? (
        <section className="workspace-panel">
          {selectedPath ? (
            <div className="workspace-reading">
              <FilePreview
                path={selectedPath}
                content={previewContent}
                mime={previewMime}
                size={previewSize}
                loading={previewLoading}
                onClose={onExitReading}
              />
            </div>
          ) : (
            <div className="workspace-file-list">
              <FileTree
                tree={fileTree}
                selectedPath={selectedPath}
                onSelect={onFileSelect}
                onDelete={onFileDelete}
                onRename={onFileRename}
              />
            </div>
          )}
        </section>
      ) : activeWorkbenchTab === "review" ? (
        <section className="review-panel">
          <section className="plan-card">
            <h2>计划文件</h2>
            <p>查看当前 Markdown 计划，或恢复历史计划版本。</p>
            <div className="plan-document-actions">
              <button onClick={onOpenPlanDocument}>打开计划文档</button>
              <button onClick={onRefreshPlanVersions} disabled={planVersionsLoading}>
                {planVersionsLoading ? "刷新中" : "刷新版本"}
              </button>
            </div>
            <div className="plan-versions">
              <div className="plan-versions-head">
                <span>计划版本</span>
                <strong>{planVersions.length}</strong>
              </div>
              {planVersionsError && <p className="plan-version-error">{planVersionsError}</p>}
              {planVersions.slice(0, 4).map((version) => (
                <div className={version.status === "active" ? "plan-version active" : "plan-version"} key={`${version.goal_id}:${version.week_start ?? "none"}`}>
                  <div>
                    <strong>{version.status === "active" ? "当前计划" : "历史计划"}</strong>
                    <span>{version.week_start ? `${shortDate(version.week_start)}-${shortDate(version.week_end ?? version.week_start)}` : "无周计划"} · {version.task_count} 项</span>
                  </div>
                  {version.status !== "active" && (
                    <button disabled={restoringPlanId === version.goal_id} onClick={() => onRestorePlanVersion(version.goal_id)}>
                      {restoringPlanId === version.goal_id ? "恢复中" : "恢复"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="error-candidate-panel">
            <div className="error-candidate-head">
              <strong>错题归因</strong>
              <button onClick={onRefreshCandidates}>刷新</button>
            </div>
            <textarea
              value={wrongQuestionText}
              onChange={(event) => onWrongQuestionTextChange(event.target.value)}
              placeholder="粘贴错题、解析或你卡住的问题"
            />
            <button className="candidate-generate" disabled={!wrongQuestionText.trim() || candidateLoading} onClick={onGenerateCandidate}>
              {candidateLoading ? "生成中" : "生成候选归因"}
            </button>
            <button className="candidate-from-file" disabled={!selectedPath || !previewContent?.trim() || candidateLoading} onClick={onGenerateCandidateFromCurrentFile}>
              从当前文档生成
            </button>
            {candidateError && <p className="candidate-error">{candidateError}</p>}
            <div className="candidate-list">
              {errorCandidates.length === 0 ? (
                <p className="candidate-empty">暂无待确认错题。</p>
              ) : (
                errorCandidates.slice(0, 3).map((candidate) => (
                  <article className="candidate-item" key={candidate.id}>
                    <strong>{candidate.subject || "待归类"}</strong>
                    <p>{candidate.question_summary}</p>
                    <span>{candidate.cause || "待确认错因"}</span>
                    <div>
                      <button disabled={updatingCandidateId === candidate.id} onClick={() => onConfirmCandidate(candidate)}>
                        确认
                      </button>
                      <button disabled={updatingCandidateId === candidate.id} onClick={() => onDismissCandidate(candidate)}>
                        驳回
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="study-review-panel">
            <div className="study-review-head">
              <strong>学习复盘</strong>
              <button onClick={onRefreshStudyReview}>刷新</button>
            </div>
            <div className="study-review-stats">
              <span>
                <strong>{dailyFeedback?.stats.completed_count ?? todaySummary.completed}</strong>
                今日完成
              </span>
              <span>
                <strong>{dailyFeedback?.stats.actual_minutes ?? weeklySummary.completedMinutes}</strong>
                反馈分钟
              </span>
              <span>
                <strong>{dailyFeedback?.stats.hard_count ?? 0}</strong>
                困难任务
              </span>
              <span>
                <strong>{dailyFeedback?.stats.confirmed_error_count ?? 0}</strong>
                已确认错因
              </span>
            </div>
            {dailyFeedback?.stats.top_causes?.length ? (
              <div className="study-review-causes">
                {dailyFeedback.stats.top_causes.map((cause) => (
                  <span key={cause}>{cause}</span>
                ))}
              </div>
            ) : null}
            <div className="weekly-review-box">
              <p>{weeklyReview?.summary || "本周复盘尚未生成。"}</p>
              <button disabled={reviewLoading} onClick={onGenerateWeeklyReview}>
                {reviewLoading ? "生成中" : weeklyReview ? "重新生成周复盘" : "生成周复盘"}
              </button>
            </div>
            {reviewError && <p className="study-review-error">{reviewError}</p>}
          </section>
        </section>
      ) : goal ? (
        <section className="plan-panel">
          <section className="plan-card compact-plan-card">
            <h2>{goal.title || "暂无计划"}</h2>
            <p>{goal.description || "从零开始搭建每日学习习惯，保持持续输入与输出。"}</p>
            <div className="plan-meta">
              <span>剩余 {daysLeft} 天</span>
              <span>进度 {planProgress}%</span>
            </div>
            <div className="plan-stats">
              <span>
                <strong>{todaySummary.total}</strong>
                今日任务
              </span>
              <span>
                <strong>{weeklySummary.totalCount}</strong>
                本周任务
              </span>
              <span>
                <strong>{weeklySummary.completedMinutes}</strong>
                已学分钟
              </span>
            </div>
            <div className="plan-progress">
              <span style={{ width: `${planProgress}%` }} />
            </div>
          </section>

          <section className="day-plan">
            <div className="day-header">
              <time>{formatAppDate(new Date())}</time>
              <div className="day-toggle">
                <button className={viewMode === "today" ? "active" : ""} onClick={() => onViewModeChange("today")}>
                  今日
                </button>
                <button className={viewMode === "week" ? "active" : ""} onClick={() => onViewModeChange("week")}>
                  本周
                </button>
              </div>
            </div>

            {viewMode === "today" ? (
              <>
                {(["morning", "afternoon", "evening"] as TimeSlot[]).map((slot) => (
                  <div className="slot-group" key={slot}>
                    <div className="slot-label">
                      <span>{slotLabel[slot]}</span>
                      <button aria-label={`添加${slotLabel[slot]}任务`} onClick={() => onOpenDraft(slot)}>
                        <Plus size={12} />
                      </button>
                    </div>
                    <div
                      className={dragOverKey === `today:${slot}` ? "slot-tasks drag-over" : "slot-tasks"}
                      onDragOver={(event) => { allowDrop(event); setDragOverKey(`today:${slot}`); }}
                      onDragLeave={() => setDragOverKey(null)}
                      onDrop={() => dropOnEmpty(formatAppDate(new Date()), slot)}
                    >
                      {draftSlot === slot && (
                        <div className="task-editor">
                          <span className="task-checkbox" />
                          <div className="editor-fields">
                            <input autoFocus value={draftTitle} onChange={(event) => onDraftTitleChange(event.target.value)} placeholder="任务名" />
                            <div>
                              <select value={draftType} onChange={(event) => onDraftTypeChange(event.target.value as TaskType)}>
                                {taskTypeOptions.map((item) => (
                                  <option key={item.value} value={item.value}>
                                    {item.label}
                                  </option>
                                ))}
                              </select>
                              <input type="number" min={0} value={draftMinutes} onChange={(event) => onDraftMinutesChange(Number(event.target.value))} />
                            </div>
                          </div>
                          <button className="icon-commit" aria-label="保存任务" onClick={() => onAddTask(slot)}>
                            <Check size={18} />
                          </button>
                          <button className="icon-muted" aria-label="取消添加" onClick={() => onDraftSlotChange(null)}>
                            <X size={18} />
                          </button>
                        </div>
                      )}

                      {groupedTasks[slot].map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          variant="daily"
                          checkboxSize={17}
                          onUpdateTask={onUpdateTask}
                          onSaveTaskFeedback={onSaveTaskFeedback}
                          onEditTask={onEditTask}
                          onDeleteTask={onDeleteTask}
                          onOpenTimer={onOpenTimer}
                          isDragging={draggingTask?.id === task.id}
                          onDragStartTask={setDraggingTask}
                          onDragEndTask={() => { setDraggingTask(null); setDragOverKey(null); }}
                          onDropOnTask={dropOnTask}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="week-plan">
                <div className="week-summary">
                  <span>{weeklySummary.range}</span>
                  <strong>
                    {weeklySummary.completedCount}/{weeklySummary.totalCount} 完成
                    <span>{weeklySummary.completedMinutes} 分钟</span>
                  </strong>
                </div>
                <div className="week-grid">
                  {weekDays.map((day) => {
                    const tasks = goal?.weekly_plan?.tasks.filter((task) => task.date === day.date) ?? [];
                    return (
                      <section className="week-day" key={day.date}>
                        <header>
                          <strong>{day.label}</strong>
                          <span>{shortDate(day.date)}</span>
                        </header>
                        <div
                          className={dragOverKey === `week:${day.date}` ? "week-day-body drag-over" : "week-day-body"}
                          onDragOver={(event) => { allowDrop(event); setDragOverKey(`week:${day.date}`); }}
                          onDragLeave={() => setDragOverKey(null)}
                          onDrop={() => draggingTask && dropOnEmpty(day.date, draggingTask.time_slot)}
                        >
                          {tasks.map((task) => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              variant="week"
                              checkboxSize={13}
                              onUpdateTask={onUpdateTask}
                              onSaveTaskFeedback={onSaveTaskFeedback}
                              onEditTask={onEditTask}
                              onDeleteTask={onDeleteTask}
                              onOpenTimer={onOpenTimer}
                              isDragging={draggingTask?.id === task.id}
                              onDragStartTask={setDraggingTask}
                              onDragEndTask={() => { setDraggingTask(null); setDragOverKey(null); }}
                              onDropOnTask={dropOnTask}
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {timerTask && (
            <div className="timer-popover">
              <div className="timer-tabs">
                <button className={timerMode === "countdown" ? "active" : ""} onClick={() => onTimerModeChange("countdown")}>
                  倒计时
                </button>
                <button className={timerMode === "countup" ? "active" : ""} onClick={() => onTimerModeChange("countup")}>
                  正计时
                </button>
              </div>
              <label>
                <input disabled={timerRunning} type="number" min={1} value={timerMinutes} onChange={(event) => onTimerMinutesChange(Number(event.target.value))} />
                <span>分钟</span>
              </label>
              <div className="timer-readout">{timerDisplay}</div>
              <div className="timer-actions">
                <button className="timer-start" onClick={onTimerStartStop}>
                  {timerRunning ? "暂停" : "开始"}
                </button>
                <button className="timer-record" disabled={timerElapsedSeconds === 0} onClick={onRecordTimer}>
                  记录
                </button>
                <button className="timer-close" onClick={onCloseTimer}>
                  关闭
                </button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <p className="muted">生成计划后，这里会显示知识树和任务列表。</p>
      )}
    </aside>
  );
}

function TaskCard({
  task,
  variant,
  checkboxSize,
  onUpdateTask,
  onSaveTaskFeedback,
  onEditTask,
  onDeleteTask,
  onOpenTimer,
  isDragging,
  onDragStartTask,
  onDragEndTask,
  onDropOnTask,
}: {
  task: DailyTask;
  variant: "daily" | "week";
  checkboxSize: number;
  onUpdateTask: (task: DailyTask, status: TaskStatus) => void;
  onSaveTaskFeedback: (task: DailyTask, payload: { actual_minutes: number; difficulty: TaskDifficulty; focus: TaskFocus; note: string }) => void;
  onEditTask: (task: DailyTask, patch: { title?: string; type?: TaskType; estimated_minutes?: number }) => void;
  onDeleteTask: (task: DailyTask) => void;
  onOpenTimer: (task: DailyTask) => void;
  isDragging: boolean;
  onDragStartTask: (task: DailyTask) => void;
  onDragEndTask: () => void;
  onDropOnTask: (event: DragEvent, targetTask: DailyTask) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [type, setType] = useState<TaskType>(task.type);
  const [minutes, setMinutes] = useState(task.estimated_minutes);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackMinutes, setFeedbackMinutes] = useState(task.actual_minutes || task.estimated_minutes || 30);
  const [feedbackDifficulty, setFeedbackDifficulty] = useState<TaskDifficulty>("ok");
  const [feedbackFocus, setFeedbackFocus] = useState<TaskFocus>("normal");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  function save() {
    if (!title.trim()) return;
    onEditTask(task, { title: title.trim(), type, estimated_minutes: minutes });
    setEditing(false);
  }

  async function saveFeedback() {
    setFeedbackSaving(true);
    setFeedbackError(null);
    try {
      await onSaveTaskFeedback(task, {
        actual_minutes: Math.max(0, feedbackMinutes),
        difficulty: feedbackDifficulty,
        focus: feedbackFocus,
        note: feedbackNote.trim(),
      });
      setFeedbackOpen(false);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : "保存反馈失败");
    } finally {
      setFeedbackSaving(false);
    }
  }

  function toggleCompletion() {
    if (task.status === "completed") {
      setFeedbackOpen(false);
      onUpdateTask(task, "pending");
      return;
    }
    if (variant === "daily") {
      setFeedbackMinutes(task.actual_minutes || task.estimated_minutes || 30);
      setFeedbackOpen(true);
      return;
    }
    onUpdateTask(task, "completed");
  }

  if (editing) {
    return (
      <div className="daily-task task-editing">
        <span className="task-checkbox" />
        <div className="editor-fields compact-task-editor">
          <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") save(); if (event.key === "Escape") setEditing(false); }} />
          <div>
            <select value={type} onChange={(event) => setType(event.target.value as TaskType)}>
              {taskTypeOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <input type="number" min={0} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} />
          </div>
        </div>
        <button className="icon-commit" aria-label="保存任务" onClick={save}><Check size={18} /></button>
        <button className="icon-muted" aria-label="取消编辑" onClick={() => setEditing(false)}><X size={18} /></button>
      </div>
    );
  }


  return (
    <>
    <div
      className={`${task.status === "completed" ? "daily-task compact-task done" : "daily-task compact-task"}${variant === "week" ? " week-compact-task" : ""}${isDragging ? " is-dragging" : ""}`}
      draggable
      onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", task.id); onDragStartTask(task); }}
      onDragEnd={onDragEndTask}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDropOnTask(event, task)}
      onDoubleClick={() => { if (variant === "daily") setEditing(true); }}
    >
      <button
        className="task-checkbox"
        aria-label={task.status === "completed" ? "标记未完成" : "标记完成"}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={toggleCompletion}
      >
        {task.status === "completed" ? <Check size={checkboxSize} /> : null}
      </button>
      <div className="task-main">
        <strong>{task.title}</strong>
        <span className="task-details">{taskTypeOptions.find((item) => item.value === task.type)?.label ?? task.type} · {task.actual_minutes ? `${task.actual_minutes}/${task.estimated_minutes}` : task.estimated_minutes} 分</span>
      </div>
      {variant === "daily" && (
        <div className="task-actions">
          <button className="timer-button" aria-label="记录任务时间" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenTimer(task); }}>
            <Clock3 size={17} />
          </button>
          <button className="delete-task-button" aria-label="删除任务" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onDeleteTask(task); }}>
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </div>
    {feedbackOpen && variant === "daily" && (
      <div className="task-feedback-panel" onDoubleClick={(event) => event.stopPropagation()}>
        <div className="feedback-row">
          <label>
            <span>实际</span>
            <input
              type="number"
              min={0}
              value={feedbackMinutes}
              onChange={(event) => setFeedbackMinutes(Number(event.target.value))}
            />
          </label>
          <div className="feedback-segment" aria-label="难度">
            {([
              ["easy", "轻松"],
              ["ok", "适中"],
              ["hard", "吃力"],
            ] as Array<[TaskDifficulty, string]>).map(([value, label]) => (
              <button
                key={value}
                className={feedbackDifficulty === value ? "active" : ""}
                onClick={() => setFeedbackDifficulty(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="feedback-segment wide" aria-label="状态">
          {([
            ["focused", "专注"],
            ["normal", "正常"],
            ["distracted", "分心"],
            ["tired", "疲惫"],
          ] as Array<[TaskFocus, string]>).map(([value, label]) => (
            <button
              key={value}
              className={feedbackFocus === value ? "active" : ""}
              onClick={() => setFeedbackFocus(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <textarea
          value={feedbackNote}
          onChange={(event) => setFeedbackNote(event.target.value)}
          placeholder="一句话复盘：哪里顺、哪里卡住了"
        />
        {feedbackError && <p className="feedback-error">{feedbackError}</p>}
        <div className="feedback-actions">
          <button className="feedback-save" disabled={feedbackSaving} onClick={() => void saveFeedback()}>
            {feedbackSaving ? "保存中" : "完成并记录"}
          </button>
          <button className="feedback-skip" disabled={feedbackSaving} onClick={() => { setFeedbackOpen(false); onUpdateTask(task, "completed"); }}>
            跳过
          </button>
        </div>
      </div>
    )}
    </>
  );
}
