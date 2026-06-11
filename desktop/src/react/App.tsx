import { useEffect, useMemo, useRef, useState } from "react";

import { Sidebar } from "./features/chat/Sidebar";
import { ChatPanel } from "./features/chat/ChatPanel";
import { SettingsModal } from "./features/settings/SettingsModal";
import { Workbench } from "./features/workbench/Workbench";
import { Titlebar } from "./shared/ui/Titlebar";

import { api, createChatStream } from "./services/api";
import type { ChatMessage, DailyTask, ErrorCandidate, FileNode, GoalTree, PlanVersionSummary, TaskDifficulty, TaskFocus, TaskStatus, TaskType, TimeSlot, UiTheme } from "../../../shared/exam-schema";
import type { DailyFeedbackResponse, WeeklyReviewResponse } from "./services/types";
import { addDays, formatAppDate, nextExamDate, shortDate, taskTypeOptions, toolLabel, weekDayLabels } from "./utils";

const PANEL_WIDTHS = {
  leftDefault: 232,
  rightDefault: 396,
  leftMin: 176,
  leftMax: 420,
  rightMin: 300,
  rightMax: 680,
  resizeHitWidth: 8,
};

export function App() {
  const [goal, setGoal] = useState<GoalTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leftWidth, setLeftWidth] = useState(PANEL_WIDTHS.leftDefault);
  const [rightWidth, setRightWidth] = useState(PANEL_WIDTHS.rightDefault);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [streamRef, setStreamRef] = useState<ReturnType<typeof createChatStream> | null>(null);
  const [currentToolLabel, setCurrentToolLabel] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"today" | "week">("today");
  const [draftSlot, setDraftSlot] = useState<TimeSlot | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftType, setDraftType] = useState<TaskType>("study");
  const [draftMinutes, setDraftMinutes] = useState(60);
  const [timerTask, setTimerTask] = useState<DailyTask | null>(null);
  const [timerMode, setTimerMode] = useState<"countdown" | "countup">("countdown");
  const [timerMinutes, setTimerMinutes] = useState(25);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerElapsedSeconds, setTimerElapsedSeconds] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsApiKey, setSettingsApiKey] = useState("");
  const [settingsBaseUrl, setSettingsBaseUrl] = useState("");
  const [settingsModel, setSettingsModel] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsKeyIsSet, setSettingsKeyIsSet] = useState(false);
  const [settingsKeyMasked, setSettingsKeyMasked] = useState("");
  const [settingsTavilyKey, setSettingsTavilyKey] = useState("");
  const [settingsSerperKey, setSettingsSerperKey] = useState("");
  const [settingsBraveKey, setSettingsBraveKey] = useState("");
  const [settingsUiTheme, setSettingsUiTheme] = useState<UiTheme>("agent_warm_paper");
  const [appUiTheme, setAppUiTheme] = useState<UiTheme>("agent_warm_paper");
  const [settingsTab, setSettingsTab] = useState<"provider" | "appearance">("provider");
  const [settingsTavilyKeyMeta, setSettingsTavilyKeyMeta] = useState({ isSet: false, masked: "" });
  const [settingsSerperKeyMeta, setSettingsSerperKeyMeta] = useState({ isSet: false, masked: "" });
  const [settingsBraveKeyMeta, setSettingsBraveKeyMeta] = useState({ isSet: false, masked: "" });
  const [activeWorkbenchTab, setActiveWorkbenchTab] = useState<"plan" | "review" | "workspace">("plan");
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState("text/plain");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Array<{ session_id: string; message_count: number; last_message_at: string; preview: string }>>([]);
  const [activeSessionId, setActiveSessionId] = useState("default");
  const [planVersions, setPlanVersions] = useState<PlanVersionSummary[]>([]);
  const [planVersionsLoading, setPlanVersionsLoading] = useState(false);
  const [planVersionsError, setPlanVersionsError] = useState<string | null>(null);
  const [restoringPlanId, setRestoringPlanId] = useState<string | null>(null);
  const [errorCandidates, setErrorCandidates] = useState<ErrorCandidate[]>([]);
  const [wrongQuestionText, setWrongQuestionText] = useState("");
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [updatingCandidateId, setUpdatingCandidateId] = useState<string | null>(null);
  const [dailyFeedback, setDailyFeedback] = useState<DailyFeedbackResponse | null>(null);
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReviewResponse["review"]>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const conversationRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    api
      .getGoal()
      .then(setGoal)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
    api.getWorkspaceTree().then((data) => setFileTree(data.tree)).catch(() => {});
    api.getSettings().then((s) => {
      setAppUiTheme(s.ui_theme);
      setSettingsUiTheme(s.ui_theme);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = appUiTheme;
  }, [appUiTheme]);

  const prevSendingRef = useRef(sendingChat);
  useEffect(() => {
    if (!sendingChat && prevSendingRef.current) {
      api.getSessions().then((data) => setSessions(data.sessions)).catch(() => {});
    }
    prevSendingRef.current = sendingChat;
  }, [sendingChat]);

  useEffect(() => {
    api.getSessions().then((data) => setSessions(data.sessions)).catch(() => {});
  }, []);

  useEffect(() => {
    void refreshPlanVersions();
    void refreshErrorCandidates();
    void refreshStudyReview();
  }, [goal?.id, goal?.weekly_plan?.tasks.length]);

  useEffect(() => {
    if (!timerRunning) return undefined;
    const interval = window.setInterval(() => {
      setTimerElapsedSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning]);

  useEffect(() => {
    const node = conversationRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: messages.length > 1 ? "smooth" : "auto" });
  }, [messages, sendingChat, currentToolLabel]);

  function startResize(panel: "left" | "right", event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panel === "left" ? leftWidth : rightWidth;

    function onMove(moveEvent: MouseEvent) {
      const delta = moveEvent.clientX - startX;
      if (panel === "left") {
        setLeftWidth(Math.min(PANEL_WIDTHS.leftMax, Math.max(PANEL_WIDTHS.leftMin, startWidth + delta)));
      } else {
        setRightWidth(Math.min(PANEL_WIDTHS.rightMax, Math.max(PANEL_WIDTHS.rightMin, startWidth - delta)));
      }
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const todayTasks = useMemo(() => {
    const today = formatAppDate(new Date());
    return goal?.weekly_plan?.tasks.filter((task) => task.date === today) ?? [];
  }, [goal]);

  const dailyVisibleTasks = useMemo(() => {
    if (!goal?.weekly_plan) return [];
    return todayTasks.length ? todayTasks : goal.weekly_plan.tasks.slice(0, 6);
  }, [goal, todayTasks]);

  const groupedTasks = useMemo(() => {
    return {
      morning: dailyVisibleTasks.filter((task) => task.time_slot === "morning"),
      afternoon: dailyVisibleTasks.filter((task) => task.time_slot === "afternoon"),
      evening: dailyVisibleTasks.filter((task) => task.time_slot === "evening")
    } satisfies Record<TimeSlot, DailyTask[]>;
  }, [dailyVisibleTasks]);

  const weekDays = useMemo(() => {
    const weekStart = goal?.weekly_plan?.week_start ?? formatAppDate(new Date());
    return Array.from({ length: 7 }, (_, index) => ({
      label: weekDayLabels[index],
      date: addDays(weekStart, index)
    }));
  }, [goal]);

  const weeklySummary = useMemo(() => {
    const tasks = goal?.weekly_plan?.tasks ?? [];
    const completed = tasks.filter((task) => task.status === "completed");
    return {
      completedCount: completed.length,
      totalCount: tasks.length,
      completedMinutes: completed.reduce((total, task) => total + (task.actual_minutes || task.estimated_minutes), 0),
      range: goal?.weekly_plan ? `${shortDate(goal.weekly_plan.week_start)} - ${shortDate(goal.weekly_plan.week_end)}` : ""
    };
  }, [goal]);

  const selectedFile = useMemo(() => {
    const findNode = (nodes: FileNode[]): FileNode | null => {
      for (const node of nodes) {
        if (node.path === selectedPath) return node;
        if (node.children) {
          const found = findNode(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    return selectedPath ? findNode(fileTree) : null;
  }, [fileTree, selectedPath]);

  const planProgress = useMemo(() => {
    const tasks = goal?.weekly_plan?.tasks ?? [];
    if (!tasks.length) return 0;
    return Math.round((tasks.filter((task) => task.status === "completed").length / tasks.length) * 100);
  }, [goal]);

  const daysLeft = useMemo(() => {
    if (!goal) return 0;
    const today = new Date();
    const examDate = new Date(`${goal.exam_date}T00:00:00`);
    return Math.max(0, Math.ceil((examDate.getTime() - today.getTime()) / 86_400_000));
  }, [goal]);

  const todaySummary = useMemo(() => {
    const completed = todayTasks.filter((task) => task.status === "completed").length;
    return { completed, total: todayTasks.length };
  }, [todayTasks]);

  const timerTargetSeconds = Math.max(1, timerMinutes) * 60;
  const timerDisplaySeconds = timerMode === "countdown" ? Math.max(0, timerTargetSeconds - timerElapsedSeconds) : timerElapsedSeconds;
  const timerDisplay = `${String(Math.floor(timerDisplaySeconds / 60)).padStart(2, "0")}:${String(timerDisplaySeconds % 60).padStart(2, "0")}`;

  useEffect(() => {
    if (!timerTask || !timerRunning || timerMode !== "countdown") return;
    if (timerElapsedSeconds < timerTargetSeconds) return;
    void recordTimer(timerTask);
  }, [timerElapsedSeconds, timerMode, timerRunning, timerTargetSeconds, timerTask]);

  async function updateTask(task: DailyTask, status: TaskStatus) {
    const updated = await api.patchTask(task.id, { status });
    setGoal(updated);
    void refreshPlanVersions();
    void refreshStudyReview();
  }

  async function saveTaskFeedback(task: DailyTask, payload: { actual_minutes: number; difficulty: TaskDifficulty; focus: TaskFocus; note: string }) {
    const result = await api.saveTaskFeedback(task.id, payload);
    setGoal(result.goal);
    void refreshPlanVersions();
    void refreshStudyReview();
  }

  async function editTask(task: DailyTask, patch: { title?: string; type?: TaskType; estimated_minutes?: number }) {
    const updated = await api.patchTask(task.id, {
      ...patch,
      subject: patch.type ? (taskTypeOptions.find((item) => item.value === patch.type)?.label ?? task.subject) : undefined,
    });
    setGoal(updated);
    void refreshPlanVersions();
    void refreshStudyReview();
  }

  async function deleteTask(task: DailyTask) {
    const updated = await api.deleteTask(task.id);
    setGoal(updated);
    void refreshPlanVersions();
    void refreshStudyReview();
  }

  async function moveTask(task: DailyTask, target: { date: string; time_slot: TimeSlot; beforeTaskId?: string; afterTaskId?: string }) {
    if (!goal?.weekly_plan) return;

    const sourceKey = `${task.date}:${task.time_slot}`;
    const targetKey = `${target.date}:${target.time_slot}`;
    const buckets = new Map<string, DailyTask[]>();

    for (const item of goal.weekly_plan.tasks) {
      if (item.id === task.id) continue;
      const key = `${item.date}:${item.time_slot}`;
      buckets.set(key, [...(buckets.get(key) ?? []), item]);
    }

    const targetBucket = [...(buckets.get(targetKey) ?? [])];
    const movedTask = { ...task, date: target.date, time_slot: target.time_slot };
    let insertIndex = targetBucket.length;

    if (target.beforeTaskId) {
      const index = targetBucket.findIndex((item) => item.id === target.beforeTaskId);
      if (index >= 0) insertIndex = index;
    } else if (target.afterTaskId) {
      const index = targetBucket.findIndex((item) => item.id === target.afterTaskId);
      if (index >= 0) insertIndex = index + 1;
    }

    targetBucket.splice(insertIndex, 0, movedTask);
    buckets.set(targetKey, targetBucket);

    const affectedKeys = new Set([sourceKey, targetKey]);
    const updates: Array<{ task: DailyTask; date: string; time_slot: TimeSlot; sort_order: number }> = [];

    for (const key of affectedKeys) {
      const [date, timeSlot] = key.split(":") as [string, TimeSlot];
      const bucket = buckets.get(key) ?? [];
      bucket.forEach((item, index) => {
        if (item.date !== date || item.time_slot !== timeSlot || item.sort_order !== index) {
          updates.push({ task: item, date, time_slot: timeSlot, sort_order: index });
        }
      });
    }

    if (!updates.length) return;
    await Promise.all(updates.map((update) => api.patchTask(update.task.id, {
      date: update.date,
      time_slot: update.time_slot,
      sort_order: update.sort_order,
    })));
    setGoal(await api.getGoal());
    void refreshPlanVersions();
    void refreshStudyReview();
  }

  async function addTask(slot: TimeSlot) {
    if (!draftTitle.trim()) return;
    const updated = await api.createTask({
      title: draftTitle.trim(),
      type: draftType,
      subject: taskTypeOptions.find((item) => item.value === draftType)?.label ?? "综合",
      estimated_minutes: draftMinutes,
      time_slot: slot,
      date: formatAppDate(new Date())
    });
    setGoal(updated);
    void refreshPlanVersions();
    void refreshStudyReview();
    setDraftSlot(null);
    setDraftTitle("");
    setDraftType("study");
    setDraftMinutes(60);
  }

  function openDraft(slot: TimeSlot) {
    setTimerTask(null);
    setDraftSlot(slot);
  }

  function openTimer(task: DailyTask) {
    setDraftSlot(null);
    setTimerTask(task);
    setTimerRunning(false);
    setTimerElapsedSeconds(0);
  }

  async function recordTimer(task: DailyTask) {
    const minutes = Math.max(1, Math.ceil(timerElapsedSeconds / 60));
    const updated = await api.patchTask(task.id, {
      actual_minutes: (task.actual_minutes || 0) + minutes,
      status: "completed"
    });
    setGoal(updated);
    setTimerTask(null);
    setTimerRunning(false);
    setTimerElapsedSeconds(0);
    void refreshPlanVersions();
    void refreshStudyReview();
  }

  async function refreshGoal() {
    try {
      const nextGoal = await api.getGoal();
      setGoal(nextGoal);
    } catch {
      // Keep the current UI if the side refresh fails; the chat still carries the answer.
    }
  }

  async function refreshPlanVersions() {
    setPlanVersionsLoading(true);
    setPlanVersionsError(null);
    try {
      const data = await api.getPlanVersions();
      setPlanVersions(data.versions);
    } catch (err) {
      setPlanVersionsError(err instanceof Error ? err.message : "加载计划版本失败");
    } finally {
      setPlanVersionsLoading(false);
    }
  }

  async function openPlanDocument() {
    try {
      const data = await api.syncPlanDocument();
      await handleFileSelect(data.document_path);
      const tree = await api.getWorkspaceTree();
      setFileTree(tree.tree);
      setActiveWorkbenchTab("workspace");
    } catch (err) {
      setError(err instanceof Error ? err.message : "打开计划文档失败");
    }
  }

  async function restorePlanVersion(goalId: string) {
    setRestoringPlanId(goalId);
    setPlanVersionsError(null);
    try {
      const data = await api.restorePlanVersion(goalId);
      setGoal(data.goal);
      const tree = await api.getWorkspaceTree();
      setFileTree(tree.tree);
      await refreshPlanVersions();
      await refreshStudyReview(data.goal);
    } catch (err) {
      setPlanVersionsError(err instanceof Error ? err.message : "恢复计划失败");
    } finally {
      setRestoringPlanId(null);
    }
  }

  async function refreshErrorCandidates() {
    try {
      const data = await api.getErrorCandidates("pending");
      setErrorCandidates(data.candidates);
      setCandidateError(null);
    } catch (err) {
      setCandidateError(err instanceof Error ? err.message : "加载错题候选失败");
    }
  }

  async function generateCandidateFromText() {
    const text = wrongQuestionText.trim();
    if (!text) return;
    setCandidateLoading(true);
    setCandidateError(null);
    try {
      const artifact = await api.createLearningArtifact({
        source_type: "manual",
        title: "手动错题材料",
        raw_text: text,
        metadata: { origin: "workbench" },
      });
      await api.generateErrorCandidate({
        artifact_id: artifact.artifact.id,
        text,
        hint: "用户在工作台提交错题材料，请生成候选错因归因。",
      });
      setWrongQuestionText("");
      await refreshErrorCandidates();
    } catch (err) {
      setCandidateError(err instanceof Error ? err.message : "生成错题候选失败");
    } finally {
      setCandidateLoading(false);
    }
  }

  async function generateCandidateFromCurrentFile() {
    const text = previewContent?.trim();
    if (!selectedPath || !text) return;
    setCandidateLoading(true);
    setCandidateError(null);
    try {
      const artifact = await api.createLearningArtifact({
        source_type: "workspace_file",
        source_ref: selectedPath,
        title: selectedPath.split(/[\\/]/).pop() || selectedPath,
        raw_text: text,
        metadata: { origin: "workspace_preview", mime: previewMime },
      });
      await api.generateErrorCandidate({
        artifact_id: artifact.artifact.id,
        text,
        hint: "用户从工作台文件预览提交错题材料，请保留文件证据来源并生成候选错因归因。",
      });
      setActiveWorkbenchTab("plan");
      await refreshErrorCandidates();
    } catch (err) {
      setCandidateError(err instanceof Error ? err.message : "从当前文档生成错题候选失败");
    } finally {
      setCandidateLoading(false);
    }
  }

  async function updateCandidateStatus(candidate: ErrorCandidate, status: "confirmed" | "dismissed") {
    setUpdatingCandidateId(candidate.id);
    setCandidateError(null);
    try {
      await api.updateErrorCandidate(candidate.id, { status });
      await refreshErrorCandidates();
      await refreshStudyReview();
    } catch (err) {
      setCandidateError(err instanceof Error ? err.message : "更新错题候选失败");
    } finally {
      setUpdatingCandidateId(null);
    }
  }

  async function refreshStudyReview(nextGoal = goal) {
    if (!nextGoal?.weekly_plan) return;
    setReviewError(null);
    try {
      const today = formatAppDate(new Date());
      const [daily, weekly] = await Promise.all([
        api.getDailyFeedback(today),
        api.getWeeklyReview(nextGoal.weekly_plan.week_start),
      ]);
      setDailyFeedback(daily);
      setWeeklyReview(weekly.review);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "加载复盘失败");
    }
  }

  async function generateWeeklyReview(regenerate = false) {
    if (!goal?.weekly_plan) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const data = await api.createWeeklyReview({
        week_start: goal.weekly_plan.week_start,
        week_end: goal.weekly_plan.week_end,
        regenerate,
      });
      setWeeklyReview(data.review);
      const daily = await api.getDailyFeedback(formatAppDate(new Date()));
      setDailyFeedback(daily);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "生成周复盘失败");
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleUploadFile(file: File) {
    setUploadError(null);
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (![".pdf", ".docx", ".md", ".markdown", ".txt", ".csv", ".tsv", ".json", ".jsonl", ".yaml", ".yml", ".rtf", ".html", ".htm", ".xml", ".tex", ".log"].includes(ext)) {
      setUploadError("仅支持 PDF、Word 和常见文本文件");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("文件不能超过 10MB");
      return;
    }

    uploadAbortRef.current?.abort();
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setUploadingFile(file.name);
    try {
      const data = await api.uploadWorkspaceFile(file, controller.signal);
      setFileTree(data.tree);
      setActiveWorkbenchTab("workspace");
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: `用户上传了 ${file.name}`,
          created_at: new Date().toISOString(),
        },
      ]);
      // 自动预览上传的文件
      if (data.file?.path) {
        setSelectedPath(data.file.path);
        setPreviewLoading(true);
        try {
          const result = await api.getWorkspaceFile(data.file.path);
          setPreviewContent(result.content);
          setPreviewMime(result.mime);
          if (result.content !== null) {
            setReadingFile(true);
            setLeftCollapsed(true);
          }
        } catch {
          setPreviewContent(null);
        } finally {
          setPreviewLoading(false);
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setUploadError(err instanceof Error ? err.message : "上传失败");
      }
    } finally {
      setUploadingFile(null);
      uploadAbortRef.current = null;
    }
  }

  function sendChat() {
    const content = chatInput.trim();
    if (!content || sendingChat) return;

    const userMessage: ChatMessage = {
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setChatInput("");
    setSendingChat(true);

    let streamedText = "";

    const stream = createChatStream({
      onToken: (delta) => {
        streamedText += delta;
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === "assistant" && (last as any)._streaming) {
            copy[copy.length - 1] = { ...last, content: streamedText };
          } else {
            copy.push({
              role: "assistant",
              content: streamedText,
              created_at: new Date().toISOString(),
              _streaming: true,
            } as any);
          }
          return copy;
        });
      },
      onToolStart: (name) => {
        setCurrentToolLabel(toolLabel(name));
      },
      onToolEnd: () => {
        setCurrentToolLabel(null);
      },
      onPlanCard: () => {
        setActiveWorkbenchTab("plan");
        void refreshGoal();
      },
      onFileList: (nextFiles) => {
        setFileTree(nextFiles);
      },
      onTurnEnd: () => {
        setSendingChat(false);
        setCurrentToolLabel(null);
        setMessages((prev) =>
          prev.map((m) => {
            if ((m as any)._streaming) {
              const { _streaming: _, ...rest } = m as any;
              return rest;
            }
            return m;
          })
        );
      },
      onError: (msg) => {
        setSendingChat(false);
        setCurrentToolLabel(null);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant" as const,
            content: `错误：${msg}`,
            created_at: new Date().toISOString(),
          },
        ]);
      },
    });

    setStreamRef(stream);
    stream.send(content, activeSessionId);
  }

  function abortChat() {
    streamRef?.abort();
    setSendingChat(false);
    setCurrentToolLabel(null);
  }

  async function openSettings() {
    setShowSettings(true);
    setSettingsTab("provider");
    setSettingsSaved(false);
    setSettingsError(null);
    try {
      const s = await api.getSettings();
      setSettingsApiKey("");
      setSettingsBaseUrl(s.base_url);
      setSettingsModel(s.model);
      setSettingsKeyIsSet(s.api_key_is_set);
      setSettingsKeyMasked(s.api_key_masked);
      setSettingsTavilyKey("");
      setSettingsSerperKey("");
      setSettingsBraveKey("");
      setSettingsUiTheme(s.ui_theme);
      setSettingsTavilyKeyMeta({ isSet: s.tavily_api_key_is_set, masked: s.tavily_api_key_masked });
      setSettingsSerperKeyMeta({ isSet: s.serper_api_key_is_set, masked: s.serper_api_key_masked });
      setSettingsBraveKeyMeta({ isSet: s.brave_search_api_key_is_set, masked: s.brave_search_api_key_masked });
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "加载设置失败");
    }
  }

  async function saveSettings() {
    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsSaved(false);
    try {
      const s = await api.updateSettings({
        api_key: settingsApiKey,
        base_url: settingsBaseUrl,
        model: settingsModel,
        tavily_api_key: settingsTavilyKey,
        serper_api_key: settingsSerperKey,
        brave_search_api_key: settingsBraveKey,
        ui_theme: settingsUiTheme,
        workspace_path: "",
      });
      setSettingsApiKey("");
      setSettingsTavilyKey("");
      setSettingsSerperKey("");
      setSettingsBraveKey("");
      setSettingsKeyIsSet(s.api_key_is_set);
      setSettingsKeyMasked(s.api_key_masked);
      setSettingsTavilyKeyMeta({ isSet: s.tavily_api_key_is_set, masked: s.tavily_api_key_masked });
      setSettingsSerperKeyMeta({ isSet: s.serper_api_key_is_set, masked: s.serper_api_key_masked });
      setSettingsBraveKeyMeta({ isSet: s.brave_search_api_key_is_set, masked: s.brave_search_api_key_masked });
      setSettingsUiTheme(s.ui_theme);
      setAppUiTheme(s.ui_theme);
      setSettingsSaved(true);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "保存设置失败");
    } finally {
      setSettingsSaving(false);
    }
  }

  function handleSelectSession(sessionId: string) {
    setActiveSessionId(sessionId);
    api.getSessionMessages(sessionId).then((data) => {
      setMessages(data.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        created_at: m.created_at,
      })));
    }).catch(() => {});
  }

  function handleNewSession() {
    const newId = `session_${Date.now()}`;
    setActiveSessionId(newId);
    setMessages([]);
  }

  async function handleDeleteSession(sessionId: string) {
    try {
      await api.deleteSession(sessionId);
      const data = await api.getSessions();
      setSessions(data.sessions);

      if (activeSessionId === sessionId) {
        const nextActive = data.sessions[0]?.session_id;
        if (nextActive) {
          setActiveSessionId(nextActive);
          const messagesData = await api.getSessionMessages(nextActive);
          setMessages(messagesData.messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
            created_at: m.created_at,
          })));
        } else {
          setActiveSessionId(`session_${Date.now()}`);
          setMessages([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除会话失败");
    }
  }

  async function handleFileSelect(path: string) {
    setSelectedPath(path);
    setPreviewLoading(true);
    try {
      const result = await api.getWorkspaceFile(path);
      setPreviewContent(result.content);
      setPreviewMime(result.mime);
      if (result.content !== null) {
        setReadingFile(true);
        setLeftCollapsed(true);
      }
    } catch {
      setPreviewContent(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleFileDelete(filePath: string) {
    try {
      const data = await api.deleteWorkspaceFile(filePath);
      setFileTree(data.tree);
      if (selectedPath === filePath) {
        setSelectedPath(null);
        setPreviewContent(null);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "删除失败");
    }
  }

  async function handleFileRename(oldPath: string) {
    const newName = window.prompt("新文件名:", oldPath);
    if (!newName || newName === oldPath) return;
    try {
      const dir = oldPath.includes("/") ? oldPath.slice(0, oldPath.lastIndexOf("/") + 1) : "";
      const newPath = dir + newName;
      const data = await api.renameWorkspaceFile(oldPath, newPath);
      setFileTree(data.tree);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "重命名失败");
    }
  }

  return (
    <div className="app-shell">
      <Titlebar
        leftCollapsed={leftCollapsed}
        rightCollapsed={rightCollapsed}
        onToggleLeft={() => setLeftCollapsed((v) => !v)}
        onToggleRight={() => setRightCollapsed((v) => !v)}
      />

      <div className="app-body" style={{ gridTemplateColumns: `${leftCollapsed ? 0 : leftWidth}px ${leftCollapsed ? 0 : PANEL_WIDTHS.resizeHitWidth}px minmax(420px, 1fr) ${rightCollapsed ? 0 : PANEL_WIDTHS.resizeHitWidth}px ${rightCollapsed ? 0 : rightWidth}px` }}>
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onOpenSettings={openSettings}
          onDeleteSession={(sessionId) => void handleDeleteSession(sessionId)}
        />
        {!leftCollapsed && (
          <button className="resize-handle resize-left" aria-label="调整左侧栏宽度" onMouseDown={(event) => startResize("left", event)} />
        )}

        <ChatPanel
          loading={loading}
          error={error}
          messages={messages}
          sendingChat={sendingChat}
          currentToolLabel={currentToolLabel}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          uploadingFile={uploadingFile}
          uploadError={uploadError}
          conversationRef={conversationRef}
          fileInputRef={fileInputRef}
          onSend={sendChat}
          onAbort={abortChat}
          onUploadFile={handleUploadFile}
          onCancelUpload={() => uploadAbortRef.current?.abort()}
        />
        {!rightCollapsed && (
          <button className="resize-handle resize-right" aria-label="调整右侧栏宽度" onMouseDown={(event) => startResize("right", event)} />
        )}

        <Workbench
          activeWorkbenchTab={activeWorkbenchTab}
          onTabChange={setActiveWorkbenchTab}
          fileTree={fileTree}
          selectedPath={selectedPath}
          previewContent={previewContent}
          previewMime={previewMime}
          previewSize={selectedFile?.size ?? 0}
          previewLoading={previewLoading}
          onFileSelect={handleFileSelect}
          onFileDelete={handleFileDelete}
          onFileRename={handleFileRename}
          readingFile={readingFile}
          onExitReading={() => {
            setReadingFile(false);
            setLeftCollapsed(false);
            setSelectedPath(null);
            setPreviewContent(null);
          }}
          goal={goal}
          daysLeft={daysLeft}
          planProgress={planProgress}
          todaySummary={todaySummary}
          weeklySummary={weeklySummary}
          planVersions={planVersions}
          planVersionsLoading={planVersionsLoading}
          planVersionsError={planVersionsError}
          restoringPlanId={restoringPlanId}
          errorCandidates={errorCandidates}
          wrongQuestionText={wrongQuestionText}
          candidateLoading={candidateLoading}
          candidateError={candidateError}
          updatingCandidateId={updatingCandidateId}
          dailyFeedback={dailyFeedback}
          weeklyReview={weeklyReview}
          reviewLoading={reviewLoading}
          reviewError={reviewError}
          onOpenPlanDocument={() => void openPlanDocument()}
          onRefreshPlanVersions={() => void refreshPlanVersions()}
          onRestorePlanVersion={(goalId) => void restorePlanVersion(goalId)}
          onWrongQuestionTextChange={setWrongQuestionText}
          onGenerateCandidate={() => void generateCandidateFromText()}
          onGenerateCandidateFromCurrentFile={() => void generateCandidateFromCurrentFile()}
          onRefreshCandidates={() => void refreshErrorCandidates()}
          onConfirmCandidate={(candidate) => void updateCandidateStatus(candidate, "confirmed")}
          onDismissCandidate={(candidate) => void updateCandidateStatus(candidate, "dismissed")}
          onRefreshStudyReview={() => void refreshStudyReview()}
          onGenerateWeeklyReview={() => void generateWeeklyReview(true)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          draftSlot={draftSlot}
          draftTitle={draftTitle}
          draftType={draftType}
          draftMinutes={draftMinutes}
          onDraftSlotChange={setDraftSlot}
          onDraftTitleChange={setDraftTitle}
          onDraftTypeChange={setDraftType}
          onDraftMinutesChange={setDraftMinutes}
          groupedTasks={groupedTasks}
          weekDays={weekDays}
          onUpdateTask={updateTask}
          onSaveTaskFeedback={(task, payload) => void saveTaskFeedback(task, payload)}
          onEditTask={(task, patch) => void editTask(task, patch)}
          onDeleteTask={(task) => void deleteTask(task)}
          onMoveTask={(task, target) => void moveTask(task, target)}
          onAddTask={addTask}
          onOpenDraft={openDraft}
          onOpenTimer={openTimer}
          timerTask={timerTask}
          timerMode={timerMode}
          timerMinutes={timerMinutes}
          timerRunning={timerRunning}
          timerElapsedSeconds={timerElapsedSeconds}
          timerDisplay={timerDisplay}
          onTimerModeChange={setTimerMode}
          onTimerMinutesChange={setTimerMinutes}
          onTimerStartStop={() => setTimerRunning((running) => !running)}
          onRecordTimer={() => timerTask && recordTimer(timerTask)}
          onCloseTimer={() => setTimerTask(null)}
        />
      </div>

      <SettingsModal
        show={showSettings}
        tab={settingsTab}
        onClose={() => setShowSettings(false)}
        onTabChange={setSettingsTab}
        onSave={saveSettings}
        saving={settingsSaving}
        error={settingsError}
        saved={settingsSaved}
        apiKey={settingsApiKey}
        onApiKeyChange={setSettingsApiKey}
        baseUrl={settingsBaseUrl}
        onBaseUrlChange={setSettingsBaseUrl}
        model={settingsModel}
        onModelChange={setSettingsModel}
        keyIsSet={settingsKeyIsSet}
        keyMasked={settingsKeyMasked}
        tavilyKey={settingsTavilyKey}
        onTavilyKeyChange={setSettingsTavilyKey}
        serperKey={settingsSerperKey}
        onSerperKeyChange={setSettingsSerperKey}
        braveKey={settingsBraveKey}
        onBraveKeyChange={setSettingsBraveKey}
        tavilyKeyMeta={settingsTavilyKeyMeta}
        serperKeyMeta={settingsSerperKeyMeta}
        braveKeyMeta={settingsBraveKeyMeta}
        uiTheme={settingsUiTheme}
        onUiThemeChange={setSettingsUiTheme}
      />
    </div>
  );
}
