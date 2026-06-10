import { Check, ChevronUp, Clock3, FileText, Pencil, Plus, Sparkles, X } from "lucide-react";
import type { ConversationFile, DailyTask, GoalTree, TaskStatus, TaskType, TimeSlot } from "../../../../shared/exam-schema";
import { formatAppDate, shortDate, slotLabel, taskTypeOptions } from "../utils";

interface WorkbenchProps {
  activeWorkbenchTab: "plan" | "files" | "workspace";
  onTabChange: (tab: "plan" | "files" | "workspace") => void;
  files: ConversationFile[];
  goal: GoalTree | null;
  daysLeft: number;
  planProgress: number;
  todaySummary: { completed: number; total: number };
  weeklySummary: { completedCount: number; totalCount: number; completedMinutes: number; range: string };
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
  onAddTask: (slot: TimeSlot) => void;
  onOpenDraft: (slot: TimeSlot) => void;
  onOpenTimer: (task: DailyTask) => void;
  onDeleteFile: (fileId: string) => void;
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
  files,
  goal,
  daysLeft,
  planProgress,
  todaySummary,
  weeklySummary,
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
  onAddTask,
  onOpenDraft,
  onOpenTimer,
  onDeleteFile,
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
  return (
    <aside className="workbench">
      <div className="workbench-title">
        <strong>Akari Workbench</strong>
        <button>
          <Sparkles size={14} />
          Phase 1.5
        </button>
      </div>
      <div className="panel-heading">
        <button className={activeWorkbenchTab === "plan" ? "active" : ""} onClick={() => onTabChange("plan")}>我的规划</button>
        <button className={activeWorkbenchTab === "files" ? "active" : ""} onClick={() => onTabChange("files")}>对话文件</button>
        <button className={activeWorkbenchTab === "workspace" ? "active" : ""} onClick={() => onTabChange("workspace")}>工作台</button>
      </div>
      {activeWorkbenchTab === "files" ? (
        <section className="file-panel">
          {files.length === 0 ? (
            <p className="workbench-empty">暂无文件，点击聊天框 + 上传</p>
          ) : (
            <div className="file-list">
              {files.map((file) => (
                <div className="file-item" key={file.file_id}>
                  <FileText size={17} />
                  <span>{file.filename}</span>
                  <button
                    className="icon-muted"
                    aria-label="删除文件"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onDeleteFile(file.file_id);
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : activeWorkbenchTab === "workspace" ? (
        <section className="file-panel">
          <p className="workbench-empty">Phase 2 将支持笔记</p>
        </section>
      ) : goal ? (
        <>
          <section className="plan-card">
            <button className="edit-plan" aria-label="编辑总计划">
              <Pencil size={17} />
            </button>
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
                        <Plus size={15} />
                      </button>
                    </div>
                    <div className="slot-tasks">
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
                        <div className={task.status === "completed" ? "daily-task done" : "daily-task"} key={task.id}>
                          <button
                            className="task-checkbox"
                            aria-label={task.status === "completed" ? "标记未完成" : "标记完成"}
                            onClick={() => onUpdateTask(task, task.status === "completed" ? "pending" : "completed")}
                          >
                            {task.status === "completed" ? <Check size={17} /> : null}
                          </button>
                          <div className="task-main">
                            <strong>{task.title}</strong>
                            <span>{taskTypeOptions.find((item) => item.value === task.type)?.label ?? task.type} · 预计 {task.estimated_minutes} 分钟{task.actual_minutes ? ` · 实际 ${task.actual_minutes} 分钟` : ""}</span>
                          </div>
                          <button className="timer-button" aria-label="记录任务时间" onClick={() => onOpenTimer(task)}>
                            <Clock3 size={18} />
                          </button>
                        </div>
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
                        <div className="week-day-body">
                          {tasks.map((task) => (
                            <div className={task.status === "completed" ? "week-task done" : "week-task"} key={task.id}>
                              <button
                                className="task-checkbox"
                                aria-label={task.status === "completed" ? "标记未完成" : "标记完成"}
                                onClick={() => onUpdateTask(task, task.status === "completed" ? "pending" : "completed")}
                              >
                                {task.status === "completed" ? <Check size={15} /> : null}
                              </button>
                              <strong>{task.title}</strong>
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="collapsed-note">
            <strong>笺</strong>
            <button aria-label="展开笺">
              <ChevronUp size={18} />
            </button>
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
        </>
      ) : (
        <p className="muted">生成计划后，这里会显示知识树和任务列表。</p>
      )}
    </aside>
  );
}
