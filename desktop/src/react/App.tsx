import { useEffect, useMemo, useRef, useState } from "react";

import { Titlebar } from "./components/Titlebar";
import { Sidebar } from "./components/Sidebar";
import { ChatPanel } from "./components/ChatPanel";
import { Workbench } from "./components/Workbench";
import { SettingsModal } from "./components/SettingsModal";

import { api, createChatStream } from "./services/api";
import type { ChatMessage, ConversationFile, DailyTask, GoalTree, TaskStatus, TaskType, TimeSlot, UiTheme } from "../../../shared/exam-schema";
import { addDays, formatAppDate, nextExamDate, shortDate, taskTypeOptions, toolLabel, weekDayLabels } from "./utils";

export function App() {
  const [goal, setGoal] = useState<GoalTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leftWidth, setLeftWidth] = useState(232);
  const [rightWidth, setRightWidth] = useState(396);
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
  const [activeWorkbenchTab, setActiveWorkbenchTab] = useState<"plan" | "files" | "workspace">("plan");
  const [files, setFiles] = useState<ConversationFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Array<{ session_id: string; message_count: number; last_message_at: string; preview: string }>>([]);
  const [activeSessionId, setActiveSessionId] = useState("default");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const conversationRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    api
      .getGoal()
      .then(setGoal)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
    api.getFiles().then((payload) => setFiles(payload.files)).catch(() => undefined);
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
        setLeftWidth(Math.min(340, Math.max(176, startWidth + delta)));
      } else {
        setRightWidth(Math.min(560, Math.max(320, startWidth - delta)));
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

  async function createPlan() {
    setLoading(true);
    setError(null);
    try {
      const generated = await api.generatePlan({
        target_score: 150,
        exam_date: nextExamDate(),
        strengths: ["言语理解与表达"],
        weaknesses: ["资料分析", "数量关系"]
      });
      setGoal(generated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成计划失败");
    } finally {
      setLoading(false);
    }
  }

  async function updateTask(task: DailyTask, status: TaskStatus) {
    const updated = await api.patchTask(task.id, { status });
    setGoal(updated);
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
  }

  async function adaptPlan() {
    const updated = await api.adaptPlan();
    setGoal(updated);
  }

  async function refreshGoal() {
    try {
      const nextGoal = await api.getGoal();
      setGoal(nextGoal);
    } catch {
      // Keep the current UI if the side refresh fails; the chat still carries the answer.
    }
  }

  async function handleUploadFile(file: File) {
    setUploadError(null);
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (![".pdf", ".docx"].includes(ext)) {
      setUploadError("仅支持 PDF 和 Word(.docx) 文件");
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
      const stored = await api.uploadFile(file, controller.signal);
      const payload = await api.getFiles();
      setFiles(payload.files);
      setActiveWorkbenchTab("files");
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: `用户上传了 ${stored.filename}`,
          created_at: new Date().toISOString(),
        },
      ]);
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
        setFiles(nextFiles);
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

  async function handleDeleteFile(fileId: string) {
    try {
      await api.deleteFile(fileId);
      const payload = await api.getFiles();
      setFiles(payload.files);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <div className="app-shell">
      <Titlebar />

      <div className="app-body" style={{ gridTemplateColumns: `${leftWidth}px 6px minmax(420px, 1fr) 6px ${rightWidth}px` }}>
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onOpenSettings={openSettings}
        />
        <button className="resize-handle resize-left" aria-label="调整左侧栏宽度" onMouseDown={(event) => startResize("left", event)} />

        <ChatPanel
          loading={loading}
          error={error}
          goal={goal}
          messages={messages}
          sendingChat={sendingChat}
          currentToolLabel={currentToolLabel}
          filesCount={files.length}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          uploadingFile={uploadingFile}
          uploadError={uploadError}
          conversationRef={conversationRef}
          fileInputRef={fileInputRef}
          onSend={sendChat}
          onAbort={abortChat}
          onCreatePlan={createPlan}
          onUploadFile={handleUploadFile}
          onCancelUpload={() => uploadAbortRef.current?.abort()}
        />
        <button className="resize-handle resize-right" aria-label="调整右侧栏宽度" onMouseDown={(event) => startResize("right", event)} />

        <Workbench
          activeWorkbenchTab={activeWorkbenchTab}
          onTabChange={setActiveWorkbenchTab}
          files={files}
          goal={goal}
          daysLeft={daysLeft}
          planProgress={planProgress}
          todaySummary={todaySummary}
          weeklySummary={weeklySummary}
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
          onAddTask={addTask}
          onOpenDraft={openDraft}
          onOpenTimer={openTimer}
          onDeleteFile={handleDeleteFile}
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
