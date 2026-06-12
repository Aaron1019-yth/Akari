import { Check, Clock3, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import type { DailyTask, ErrorCandidate, FileNode, GoalTree, PlanVersionSummary, TaskDifficulty, TaskFocus, TaskStatus, TaskType, TimeSlot } from "../../../../../shared/exam-schema";
import { shortDate, slotLabel, taskDifficultyOptions, taskFocusOptions, taskTypeOptions, timeSlots } from "../../utils";
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
  archivingPlanId: string | null;
  deletingPlanId: string | null;
  manualPlanTitle: string;
  manualPlanDescription: string;
  manualPlanTargetScore: number;
  manualPlanExamDate: string;
  manualPlanSaving: boolean;
  manualPlanError: string | null;
  goalEditing: boolean;
  goalDraftTitle: string;
  goalDraftDescription: string;
  goalSaving: boolean;
  goalEditError: string | null;
  errorCandidates: ErrorCandidate[];
  candidateError: string | null;
  updatingCandidateId: string | null;
  selectedPlanDate: string;
  onSelectedPlanDateChange: (date: string) => void;
  onOpenPlanDocument: () => void;
  onOpenDailyReview: () => void;
  onRefreshPlanVersions: () => void;
  onRestorePlanVersion: (goalId: string) => void;
  onArchivePlanVersion: (goalId: string) => void;
  onDeletePlanVersion: (goalId: string) => void;
  onManualPlanTitleChange: (value: string) => void;
  onManualPlanDescriptionChange: (value: string) => void;
  onManualPlanTargetScoreChange: (value: number) => void;
  onManualPlanExamDateChange: (value: string) => void;
  onCreateManualPlan: () => void;
  onGoalEditingChange: (editing: boolean) => void;
  onGoalDraftTitleChange: (value: string) => void;
  onGoalDraftDescriptionChange: (value: string) => void;
  onSaveGoalMetadata: () => void;
  onRefreshCandidates: () => void;
  onConfirmCandidate: (candidate: ErrorCandidate) => void;
  onDismissCandidate: (candidate: ErrorCandidate) => void;
  viewMode: "today" | "week";
  onViewModeChange: (mode: "today" | "week") => void;
  draftSlot: TimeSlot | null;
  draftTitle: string;
  draftType: TaskType;
  onDraftSlotChange: (slot: TimeSlot | null) => void;
  onDraftTitleChange: (title: string) => void;
  onDraftTypeChange: (type: TaskType) => void;
  groupedTasks: Record<TimeSlot, DailyTask[]>;
  weekDays: Array<{ label: string; date: string }>;
  onUpdateTask: (task: DailyTask, status: TaskStatus) => void;
  onSaveTaskFeedback: (task: DailyTask, payload: { actual_minutes: number; difficulty: TaskDifficulty; focus: TaskFocus; note: string }) => void;
  onEditTask: (task: DailyTask, patch: { title?: string; type?: TaskType }) => void;
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
  archivingPlanId,
  deletingPlanId,
  manualPlanTitle,
  manualPlanDescription,
  manualPlanTargetScore,
  manualPlanExamDate,
  manualPlanSaving,
  manualPlanError,
  goalEditing,
  goalDraftTitle,
  goalDraftDescription,
  goalSaving,
  goalEditError,
  errorCandidates,
  candidateError,
  updatingCandidateId,
  selectedPlanDate,
  onSelectedPlanDateChange,
  onOpenPlanDocument,
  onOpenDailyReview,
  onRefreshPlanVersions,
  onRestorePlanVersion,
  onArchivePlanVersion,
  onDeletePlanVersion,
  onManualPlanTitleChange,
  onManualPlanDescriptionChange,
  onManualPlanTargetScoreChange,
  onManualPlanExamDateChange,
  onCreateManualPlan,
  onGoalEditingChange,
  onGoalDraftTitleChange,
  onGoalDraftDescriptionChange,
  onSaveGoalMetadata,
  onRefreshCandidates,
  onConfirmCandidate,
  onDismissCandidate,
  viewMode,
  onViewModeChange,
  draftSlot,
  draftTitle,
  draftType,
  onDraftSlotChange,
  onDraftTitleChange,
  onDraftTypeChange,
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

  function setDragOver(nextKey: string | null) {
    setDragOverKey((currentKey) => currentKey === nextKey ? currentKey : nextKey);
  }

  function planVersionName(version: PlanVersionSummary) {
    if (version.status === "active") return "当前计划";
    const date = version.document_path.split("/").pop()?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? version.created_at.slice(0, 10);
    return `${date} 历史计划`;
  }

  function dropOnEmpty(date: string, timeSlot: TimeSlot) {
    if (!draggingTask) return;
    onMoveTask(draggingTask, { date, time_slot: timeSlot });
    setDraggingTask(null);
    setDragOver(null);
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
    setDragOver(null);
  }

  return (
    <aside className="workbench">
      <div className="panel-heading">
        <button className={activeWorkbenchTab === "plan" ? "active" : ""} onClick={() => onTabChange("plan")}>我的规划</button>
        <button className={activeWorkbenchTab === "review" ? "active" : ""} onClick={() => onTabChange("review")}>复盘素材</button>
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
          <section className="review-entry-card">
            <div className="review-entry-head">
              <div>
                <strong>今日复盘</strong>
                <p>打开 reviews/ 目录下的当日复盘 Markdown。文件由对话中“入复盘”操作生成。</p>
              </div>
              <button onClick={onOpenDailyReview}>打开当日复盘</button>
            </div>
            <p className="review-entry-hint">
              复盘素材通过聊天附件勾选“入复盘”后自动归档到 review/ 文件夹；分析结果保存为 reviews/YYYY-MM-DD-daily-review.md。
            </p>
          </section>

          {errorCandidates.length > 0 && (
            <section className="error-candidate-panel">
              <div className="error-candidate-head">
                <div>
                  <strong>待确认素材</strong>
                  <p>聊天分拣后未确认的素材会出现在这里，作为兜底入口。</p>
                </div>
                <button onClick={onRefreshCandidates}>刷新</button>
              </div>
              {candidateError && <p className="candidate-error">{candidateError}</p>}
              <div className="candidate-list">
                {errorCandidates.slice(0, 5).map((candidate) => (
                  <ReviewCandidateItem
                    key={candidate.id}
                    candidate={candidate}
                    updating={updatingCandidateId === candidate.id}
                    onConfirm={onConfirmCandidate}
                    onDismiss={onDismissCandidate}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="plan-versions-card">
            <details className="plan-versions-collapse">
              <summary>
                <span>计划版本</span>
                <strong>{planVersions.length}</strong>
                <span className="plan-versions-summary-actions">
                  <button onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenPlanDocument(); }}>
                    打开文档
                  </button>
                  <button
                    disabled={planVersionsLoading}
                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRefreshPlanVersions(); }}
                  >
                    {planVersionsLoading ? "刷新中" : "刷新"}
                  </button>
                </span>
              </summary>
              <div className="plan-versions">
                {planVersionsError && <p className="plan-version-error">{planVersionsError}</p>}
                {planVersions.slice(0, 4).map((version) => (
                  <div className={version.status === "active" ? "plan-version active" : "plan-version"} key={`${version.goal_id}:${version.week_start ?? "none"}`}>
                    <div>
                      <strong>{planVersionName(version)}</strong>
                      <span>{version.status === "active" ? "当前计划" : "历史计划"} · {version.week_start ? `${shortDate(version.week_start)}-${shortDate(version.week_end ?? version.week_start)}` : "无周计划"} · {version.task_count} 项</span>
                    </div>
                    <div className="plan-version-actions">
                      {version.status === "active" ? (
                        <button disabled={archivingPlanId === version.goal_id} onClick={() => onArchivePlanVersion(version.goal_id)}>
                          {archivingPlanId === version.goal_id ? "归档中" : "归档"}
                        </button>
                      ) : (
                        <>
                          <button disabled={restoringPlanId === version.goal_id || deletingPlanId === version.goal_id} onClick={() => onRestorePlanVersion(version.goal_id)}>
                            {restoringPlanId === version.goal_id ? "恢复中" : "恢复"}
                          </button>
                          <button className="plan-version-delete" disabled={restoringPlanId === version.goal_id || deletingPlanId === version.goal_id} onClick={() => onDeletePlanVersion(version.goal_id)}>
                            {deletingPlanId === version.goal_id ? "删除中" : "删除"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </section>
        </section>
      ) : goal ? (
        <section className="plan-panel">
          <section className="plan-card compact-plan-card">
            {goalEditing ? (
              <div className="goal-editor">
                <input value={goalDraftTitle} onChange={(event) => onGoalDraftTitleChange(event.target.value)} placeholder="目标名称" />
                <textarea value={goalDraftDescription} onChange={(event) => onGoalDraftDescriptionChange(event.target.value)} placeholder="目标说明" />
                {goalEditError && <p className="goal-edit-error">{goalEditError}</p>}
                <div className="goal-editor-actions">
                  <button disabled={goalSaving || !goalDraftTitle.trim()} onClick={onSaveGoalMetadata}>
                    {goalSaving ? "保存中" : "保存目标"}
                  </button>
                  <button disabled={goalSaving} onClick={() => onGoalEditingChange(false)}>取消</button>
                </div>
              </div>
            ) : (
              <>
                <div className="plan-title-row">
                  <h2>{goal.title || "暂无计划"}</h2>
                  <button onClick={() => onGoalEditingChange(true)}>编辑</button>
                </div>
                <p>{goal.description || "从零开始搭建每日学习习惯，保持持续输入与输出。"}</p>
              </>
            )}
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
              <time>{selectedPlanDate}</time>
              <div className="day-toggle">
                <button className={viewMode === "today" ? "active" : ""} onClick={() => onViewModeChange("today")}>
                  日视图
                </button>
                <button className={viewMode === "week" ? "active" : ""} onClick={() => onViewModeChange("week")}>
                  周视图
                </button>
              </div>
            </div>

            {viewMode === "today" ? (
              <>
                <div className="day-chip-row">
                  {weekDays.map((day) => (
                    <button
                      className={day.date === selectedPlanDate ? "active" : ""}
                      key={day.date}
                      onClick={() => onSelectedPlanDateChange(day.date)}
                    >
                      <span>{day.label}</span>
                      <small>{shortDate(day.date)}</small>
                    </button>
                  ))}
                </div>
                {timeSlots.map((slot) => (
                  <div className="slot-group" key={slot}>
                    <div className="slot-label">
                      <span>{slotLabel[slot]}</span>
                      <button aria-label={`添加${slotLabel[slot]}任务`} onClick={() => onOpenDraft(slot)}>
                        <Plus size={12} />
                      </button>
                    </div>
                    <div
                      className={dragOverKey === `today:${slot}` ? "slot-tasks drag-over" : "slot-tasks"}
                      onDragOver={(event) => { allowDrop(event); setDragOver(`today:${slot}`); }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={() => dropOnEmpty(selectedPlanDate, slot)}
                    >
                      {draftSlot === slot && (
                        <div className="task-editor">
                          <span className="task-checkbox" />
                          <div className="editor-fields">
                            <input autoFocus value={draftTitle} onChange={(event) => onDraftTitleChange(event.target.value)} placeholder="任务名" />
                            <select value={draftType} onChange={(event) => onDraftTypeChange(event.target.value as TaskType)}>
                              {taskTypeOptions.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
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
                          onDragEndTask={() => { setDraggingTask(null); setDragOver(null); }}
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
                        <button
                          className="week-day-header"
                          onClick={() => { onSelectedPlanDateChange(day.date); onViewModeChange("today"); }}
                        >
                          <strong>{day.label}</strong>
                          <span>{shortDate(day.date)}</span>
                        </button>
                        <div
                          className={dragOverKey === `week:${day.date}` ? "week-day-body drag-over" : "week-day-body"}
                          onDragOver={(event) => { allowDrop(event); setDragOver(`week:${day.date}`); }}
                          onDragLeave={() => setDragOver(null)}
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
                              onDragEndTask={() => { setDraggingTask(null); setDragOver(null); }}
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
        <section className="plan-panel">
          <section className="manual-plan-card">
            <div>
              <span className="manual-plan-kicker">无需先和 Agent 对话</span>
              <h2>手动建立规划</h2>
              <p>先把目标和本周容器建起来，再按天添加任务、记录完成反馈、沉淀复盘素材。</p>
            </div>
            <label>
              <span>目标名称</span>
              <input value={manualPlanTitle} onChange={(event) => onManualPlanTitleChange(event.target.value)} />
            </label>
            <label>
              <span>目标说明</span>
              <textarea value={manualPlanDescription} onChange={(event) => onManualPlanDescriptionChange(event.target.value)} />
            </label>
            <div className="manual-plan-grid">
              <label>
                <span>目标分</span>
                <input type="number" min={1} max={300} value={manualPlanTargetScore} onChange={(event) => onManualPlanTargetScoreChange(Number(event.target.value))} />
              </label>
              <label>
                <span>考试日期</span>
                <input type="date" value={manualPlanExamDate} onChange={(event) => onManualPlanExamDateChange(event.target.value)} />
              </label>
            </div>
            {manualPlanError && <p className="manual-plan-error">{manualPlanError}</p>}
            <button className="manual-plan-submit" disabled={manualPlanSaving || !manualPlanTitle.trim()} onClick={onCreateManualPlan}>
              {manualPlanSaving ? "创建中" : "创建手动规划"}
            </button>
          </section>
        </section>
      )}
    </aside>
  );
}

function ReviewCandidateItem({
  candidate,
  updating,
  onConfirm,
  onDismiss,
}: {
  candidate: ErrorCandidate;
  updating: boolean;
  onConfirm: (candidate: ErrorCandidate) => void;
  onDismiss: (candidate: ErrorCandidate) => void;
}) {
  return (
    <article className="candidate-item">
      <div>
        <strong>{candidate.question_summary || candidate.mistake_summary || "手动复盘素材"}</strong>
        <span>{candidate.cause || "待归类"}</span>
      </div>
      <p>{candidate.suggested_fix || candidate.mistake_summary || "确认后会进入日/周复盘素材。"}</p>
      <div>
        <button disabled={updating} onClick={() => onConfirm(candidate)}>加入复盘</button>
        <button disabled={updating} onClick={() => onDismiss(candidate)}>忽略</button>
      </div>
    </article>
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
  onEditTask: (task: DailyTask, patch: { title?: string; type?: TaskType }) => void;
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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackDifficulty, setFeedbackDifficulty] = useState<TaskDifficulty>("ok");
  const [feedbackFocus, setFeedbackFocus] = useState<TaskFocus>("normal");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const stackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!feedbackOpen) return undefined;

    function handleMouseDown(event: MouseEvent) {
      if (!stackRef.current?.contains(event.target as Node)) {
        setFeedbackOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFeedbackOpen(false);
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [feedbackOpen]);

  function save() {
    if (!title.trim()) return;
    onEditTask(task, { title: title.trim(), type });
    setEditing(false);
  }

  async function saveFeedback() {
    setFeedbackSaving(true);
    setFeedbackError(null);
    try {
      await onSaveTaskFeedback(task, {
        actual_minutes: task.actual_minutes || 0,
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
      if (feedbackOpen) {
        setFeedbackOpen(false);
        return;
      }
      setFeedbackDifficulty("ok");
      setFeedbackFocus("normal");
      setFeedbackNote("");
      setFeedbackError(null);
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
          <select value={type} onChange={(event) => setType(event.target.value as TaskType)}>
            {taskTypeOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>
        <button className="icon-commit" aria-label="保存任务" onClick={save}><Check size={18} /></button>
        <button className="icon-muted" aria-label="取消编辑" onClick={() => setEditing(false)}><X size={18} /></button>
      </div>
    );
  }


  return (
    <div className="task-card-stack" ref={stackRef}>
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
        <span className="task-details">{taskTypeOptions.find((item) => item.value === task.type)?.label ?? task.type}{task.actual_minutes ? ` · ${task.actual_minutes} 分` : " · 未计时"}</span>
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
        <div className="feedback-row" aria-label="难度">
          <span className="feedback-row-label">难度</span>
          <div className="feedback-segment">
            {taskDifficultyOptions.map(({ value, label }) => (
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
        <div className="feedback-row" aria-label="状态">
          <span className="feedback-row-label">状态</span>
          <div className="feedback-segment">
            {taskFocusOptions.map(({ value, label }) => (
              <button
                key={value}
                className={feedbackFocus === value ? "active" : ""}
                onClick={() => setFeedbackFocus(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={feedbackNote}
          onChange={(event) => setFeedbackNote(event.target.value)}
          placeholder="留一句给之后的自己：这次最值得记住的是什么？"
        />
        {feedbackError && <p className="feedback-error">{feedbackError}</p>}
        <div className="feedback-actions">
          <button className="feedback-save" disabled={feedbackSaving} onClick={() => void saveFeedback()}>
            {feedbackSaving ? "记录中" : "记录完成"}
          </button>
        </div>
      </div>
    )}
    </div>
  );
}
