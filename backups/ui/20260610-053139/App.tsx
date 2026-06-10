import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronUp,
  Clock3,
  ClipboardList,
  FileText,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  X
} from "lucide-react";

import { api, createChatStream } from "./services/api";
import type { ChatMessage, ConversationFile, DailyTask, GoalTree, PlanCardPayload, TaskStatus, TaskType, TimeSlot, UiTheme } from "../../../shared/exam-schema";

const statusLabel: Record<TaskStatus, string> = {
  pending: "待开始",
  in_progress: "进行中",
  completed: "已完成",
  skipped: "已跳过"
};

const slotLabel: Record<TimeSlot, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上"
};

const taskTypeOptions: Array<{ label: string; value: TaskType }> = [
  { label: "综合", value: "study" },
  { label: "练题", value: "practice" },
  { label: "复习", value: "review" },
  { label: "模考", value: "mock_exam" },
  { label: "申论", value: "essay" }
];

const weekDayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const uiThemeOptions: Array<{ label: string; value: UiTheme; description: string }> = [
  { label: "新暖纸", value: "agent_warm_paper", description: "agent_demo-main 的纸本配色与字体气质" },
  { label: "Akari 冷灰蓝", value: "akari_cool", description: "当前更偏工作台的浅灰蓝风格" },
  { label: "经典米色", value: "classic_beige", description: "上一版柔和米色界面" },
];

function nextExamDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 150);
  return formatAppDate(date);
}

function formatAppDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00+08:00`);
  date.setDate(date.getDate() + days);
  return formatAppDate(date);
}

function shortDate(dateString: string): string {
  return dateString.slice(5);
}

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
  const [planCard, setPlanCard] = useState<PlanCardPayload | null>(null);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
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

  function toolLabel(name: string): string {
    const map: Record<string, string> = {
      get_planner_context: "查看备考状态",
      get_today_tasks: "查看今日任务",
      get_week_tasks: "查看本周任务",
      create_task: "创建任务",
      update_task: "更新任务",
      get_module_stats: "分析模块数据",
      web_search: "搜索资料",
      web_fetch: "读取网页",
      read_document: "读取文档",
      generate_plan: "生成计划",
    };
    return map[name] || name;
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
      onPlanCard: (card) => {
        setPlanCard(card);
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
    stream.send(content);
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

  return (
    <div className="app-shell" style={{ gridTemplateColumns: `${leftWidth}px 6px minmax(420px, 1fr) 6px ${rightWidth}px` }}>
      <aside className="sidebar">
        <div className="brand">
          <Sparkles size={22} />
          <span>Akari</span>
        </div>
        <div className="sidebar-section-title">会话</div>
        <button className="session is-active">
          <MessageSquareText size={18} />
          <span>
            公考备考对话
            <small>default</small>
          </span>
        </button>
        <button className="session">
          <ClipboardList size={18} />
          <span>
            今日任务
            <small>{todaySummary.completed}/{todaySummary.total || 0} 完成</small>
          </span>
        </button>
        <div className="sidebar-status">
          <strong>Phase 1.5</strong>
          <span>UI polish in progress</span>
        </div>
        <button className="session settings-button" onClick={openSettings}>
          <Settings size={18} />
          设置
        </button>
      </aside>
      <button className="resize-handle resize-left" aria-label="调整左侧栏宽度" onMouseDown={(event) => startResize("left", event)} />

      <main
        className="chat-panel"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) void handleUploadFile(file);
        }}
        onPaste={(event) => {
          const file = event.clipboardData.files[0];
          if (file) void handleUploadFile(file);
        }}
      >
        <header className="chat-statusbar">
          <div>
            <strong>对话式规划教练</strong>
            <span>{sendingChat ? (currentToolLabel ? `正在${currentToolLabel}` : "正在回复") : "就绪"}</span>
          </div>
          <div className="status-pills">
            <span>{messages.length} 条消息</span>
            <span>{files.length} 个文件</span>
          </div>
        </header>

        <section className="conversation" ref={conversationRef}>
          {loading && <p className="muted">正在连接 Akari 后端...</p>}
          {error && <p className="error">{error}</p>}
          {!loading && !goal && (
            <div className="onboarding">
              <h2>还没有 active Goal</h2>
              <p>先生成一份规则版计划，后续再接入规划师 Agent 和诊断对话。</p>
              <button className="primary" onClick={createPlan}>
                生成第一周计划
              </button>
            </div>
          )}
          {goal && messages.length === 0 && (
            <div className="agent-empty">
              <div className="agent-avatar">A</div>
              <h1>今天想聊点什么？</h1>
              <p>工作台：OH-WorkSpace</p>
              <span>记忆</span>
            </div>
          )}
          {messages.length > 0 && (
            <div className="message-list">
              {messages.map((message, index) => (
                <article className={`chat-message ${message.role}`} key={`${message.created_at}-${index}`}>
                  <span>{message.role === "user" ? "你" : "Akari"}</span>
                  <p>{message.content}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="chat-composer">
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept=".pdf,.docx"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (file) void handleUploadFile(file);
            }}
          />
          <textarea
            aria-label="输入对话消息"
            placeholder="选中页面任意文字，会浮出一个临时输入框"
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendChat();
              }
            }}
          />
          {(uploadingFile || uploadError) && (
            <div className="composer-upload-row">
              {uploadingFile ? (
                <>
                  <Loader2 size={15} className="spin" />
                  <span>{uploadingFile}</span>
                  <button onClick={() => uploadAbortRef.current?.abort()}>取消</button>
                </>
              ) : (
                <span className="error">{uploadError}</span>
              )}
            </div>
          )}
          <div className="composer-actions">
            <button aria-label="添加附件" onClick={() => fileInputRef.current?.click()}>
              <Plus size={18} />
            </button>
            <button aria-label="唤起能力">
              <Sparkles size={17} />
            </button>
            <button>自动审核</button>
            <span />
            <button>请选择模型</button>
            {sendingChat && (
              <>
                <button className="abort-button" onClick={abortChat}>中断</button>
                {currentToolLabel && <span className="tool-status">正在{currentToolLabel}...</span>}
              </>
            )}
            <button className="send-button" disabled={!chatInput.trim() || sendingChat} onClick={() => void sendChat()}>
              {sendingChat ? "发送中" : "发送"}
            </button>
          </div>
        </section>
      </main>
      <button className="resize-handle resize-right" aria-label="调整右侧栏宽度" onMouseDown={(event) => startResize("right", event)} />

      <aside className="workbench">
        <div className="workbench-title">
          <strong>Akari Workbench</strong>
          <button>
            <Sparkles size={14} />
            Phase 1.5
          </button>
        </div>
        <div className="panel-heading">
          <button className={activeWorkbenchTab === "plan" ? "active" : ""} onClick={() => setActiveWorkbenchTab("plan")}>我的规划</button>
          <button className={activeWorkbenchTab === "files" ? "active" : ""} onClick={() => setActiveWorkbenchTab("files")}>对话文件</button>
          <button className={activeWorkbenchTab === "workspace" ? "active" : ""} onClick={() => setActiveWorkbenchTab("workspace")}>工作台</button>
        </div>
        {activeWorkbenchTab === "files" ? (
          <section className="file-panel">
            {files.length === 0 ? (
              <p className="workbench-empty">暂无文件，点击聊天框 + 上传</p>
            ) : (
              <div className="file-list">
                {files.map((file) => (
                  <button className="file-item" key={file.file_id} onClick={() => setUploadError("Phase 2 将支持预览")}>
                    <FileText size={17} />
                    <span>{file.filename}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : activeWorkbenchTab === "workspace" ? (
          <section className="file-panel">
            <p className="workbench-empty">Phase 2 将支持笔记</p>
          </section>
        ) : goal || planCard ? (
          <>
            <section className="plan-card">
              <button className="edit-plan" aria-label="编辑总计划">
                <Pencil size={17} />
              </button>
              <h2>{planCard?.title || "建立学习节奏"}</h2>
              <p>{planCard?.message || "从零开始搭建每日学习习惯，保持持续输入与输出。"}</p>
              <div className="plan-meta">
                <span>剩余 {daysLeft} 天</span>
                <span>进度 {planCard?.completion_rate ?? planProgress}%</span>
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
                <span style={{ width: `${planCard?.completion_rate ?? planProgress}%` }} />
              </div>
            </section>

            {goal ? <section className="day-plan">
              <div className="day-header">
                <time>{formatAppDate(new Date())}</time>
                <div className="day-toggle">
                  <button className={viewMode === "today" ? "active" : ""} onClick={() => setViewMode("today")}>
                    今日
                  </button>
                  <button className={viewMode === "week" ? "active" : ""} onClick={() => setViewMode("week")}>
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
                        <button aria-label={`添加${slotLabel[slot]}任务`} onClick={() => openDraft(slot)}>
                          <Plus size={15} />
                        </button>
                      </div>
                      <div className="slot-tasks">
                        {draftSlot === slot && (
                          <div className="task-editor">
                            <span className="task-checkbox" />
                            <div className="editor-fields">
                              <input autoFocus value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="任务名" />
                              <div>
                                <select value={draftType} onChange={(event) => setDraftType(event.target.value as TaskType)}>
                                  {taskTypeOptions.map((item) => (
                                    <option key={item.value} value={item.value}>
                                      {item.label}
                                    </option>
                                  ))}
                                </select>
                                <input type="number" min={0} value={draftMinutes} onChange={(event) => setDraftMinutes(Number(event.target.value))} />
                              </div>
                            </div>
                            <button className="icon-commit" aria-label="保存任务" onClick={() => addTask(slot)}>
                              <Check size={18} />
                            </button>
                            <button className="icon-muted" aria-label="取消添加" onClick={() => setDraftSlot(null)}>
                              <X size={18} />
                            </button>
                          </div>
                        )}

                        {groupedTasks[slot].map((task) => (
                          <div className={task.status === "completed" ? "daily-task done" : "daily-task"} key={task.id}>
                            <button
                              className="task-checkbox"
                              aria-label={task.status === "completed" ? "标记未完成" : "标记完成"}
                              onClick={() => updateTask(task, task.status === "completed" ? "pending" : "completed")}
                            >
                              {task.status === "completed" ? <Check size={17} /> : null}
                            </button>
                            <div className="task-main">
                              <strong>{task.title}</strong>
                              <span>{taskTypeOptions.find((item) => item.value === task.type)?.label ?? task.type} · 预计 {task.estimated_minutes} 分钟{task.actual_minutes ? ` · 实际 ${task.actual_minutes} 分钟` : ""}</span>
                            </div>
                            <button className="timer-button" aria-label="记录任务时间" onClick={() => openTimer(task)}>
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
                      const tasks = goal.weekly_plan?.tasks.filter((task) => task.date === day.date) ?? [];
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
                                  onClick={() => updateTask(task, task.status === "completed" ? "pending" : "completed")}
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
            </section> : null}

            <section className="collapsed-note">
              <strong>笺</strong>
              <button aria-label="展开笺">
                <ChevronUp size={18} />
              </button>
            </section>

            {timerTask && (
              <div className="timer-popover">
                <div className="timer-tabs">
                  <button className={timerMode === "countdown" ? "active" : ""} onClick={() => setTimerMode("countdown")}>
                    倒计时
                  </button>
                  <button className={timerMode === "countup" ? "active" : ""} onClick={() => setTimerMode("countup")}>
                    正计时
                  </button>
                </div>
                <label>
                  <input disabled={timerRunning} type="number" min={1} value={timerMinutes} onChange={(event) => setTimerMinutes(Number(event.target.value))} />
                  <span>分钟</span>
                </label>
                <div className="timer-readout">{timerDisplay}</div>
                <div className="timer-actions">
                  <button className="timer-start" onClick={() => setTimerRunning((running) => !running)}>
                    {timerRunning ? "暂停" : "开始"}
                  </button>
                  <button className="timer-record" disabled={timerElapsedSeconds === 0} onClick={() => recordTimer(timerTask)}>
                    记录
                  </button>
                  <button className="timer-close" onClick={() => setTimerTask(null)}>
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

      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>设置</h2>
              <button className="icon-muted" onClick={() => setShowSettings(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="settings-tabs">
              <button className={settingsTab === "provider" ? "active" : ""} onClick={() => setSettingsTab("provider")}>
                模型设置
              </button>
              <button className={settingsTab === "appearance" ? "active" : ""} onClick={() => setSettingsTab("appearance")}>
                界面设置
              </button>
            </div>

            <div className="settings-body">
              {settingsTab === "provider" ? (
                <>
                  <label className="settings-field">
                    <span>API Key</span>
                    {settingsKeyIsSet && !settingsApiKey && (
                      <p className="settings-hint">已设置 ({settingsKeyMasked})</p>
                    )}
                    <input
                      type="password"
                      value={settingsApiKey}
                      onChange={(e) => setSettingsApiKey(e.target.value)}
                      placeholder={settingsKeyIsSet ? "留空则保持不变" : "输入 DeepSeek API Key"}
                    />
                  </label>

                  <label className="settings-field">
                    <span>Base URL</span>
                    <input
                      type="text"
                      value={settingsBaseUrl}
                      onChange={(e) => setSettingsBaseUrl(e.target.value)}
                      placeholder="https://api.deepseek.com"
                    />
                  </label>

                  <label className="settings-field">
                    <span>模型</span>
                    <input
                      type="text"
                      value={settingsModel}
                      onChange={(e) => setSettingsModel(e.target.value)}
                      placeholder="deepseek-v4-flash"
                    />
                  </label>

                  <label className="settings-field">
                    <span>Tavily Search Key</span>
                    {settingsTavilyKeyMeta.isSet && !settingsTavilyKey && (
                      <p className="settings-hint">已设置 ({settingsTavilyKeyMeta.masked})</p>
                    )}
                    <input
                      type="password"
                      value={settingsTavilyKey}
                      onChange={(e) => setSettingsTavilyKey(e.target.value)}
                      placeholder={settingsTavilyKeyMeta.isSet ? "留空则保持不变" : "可选，用于 web_search"}
                    />
                  </label>

                  <label className="settings-field">
                    <span>Serper Search Key</span>
                    {settingsSerperKeyMeta.isSet && !settingsSerperKey && (
                      <p className="settings-hint">已设置 ({settingsSerperKeyMeta.masked})</p>
                    )}
                    <input
                      type="password"
                      value={settingsSerperKey}
                      onChange={(e) => setSettingsSerperKey(e.target.value)}
                      placeholder={settingsSerperKeyMeta.isSet ? "留空则保持不变" : "可选，用于 web_search"}
                    />
                  </label>

                  <label className="settings-field">
                    <span>Brave Search Key</span>
                    {settingsBraveKeyMeta.isSet && !settingsBraveKey && (
                      <p className="settings-hint">已设置 ({settingsBraveKeyMeta.masked})</p>
                    )}
                    <input
                      type="password"
                      value={settingsBraveKey}
                      onChange={(e) => setSettingsBraveKey(e.target.value)}
                      placeholder={settingsBraveKeyMeta.isSet ? "留空则保持不变" : "可选，用于 web_search"}
                    />
                  </label>
                </>
              ) : (
                <section className="appearance-settings">
                  <div className="settings-field">
                    <span>界面风格</span>
                    <p className="settings-hint">字体使用 agent_demo-main 的 UI/衬线字体栈；主题会保存到本地配置。</p>
                  </div>
                  <div className="theme-options">
                    {uiThemeOptions.map((option) => (
                      <button
                        className={settingsUiTheme === option.value ? "theme-option active" : "theme-option"}
                        key={option.value}
                        onClick={() => setSettingsUiTheme(option.value)}
                      >
                        <span className={`theme-swatch ${option.value}`} />
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="settings-footer">
              {settingsError && <p className="error">{settingsError}</p>}
              {settingsSaved && <p className="settings-saved-msg">已保存</p>}
              <button className="primary" onClick={saveSettings} disabled={settingsSaving}>
                {settingsSaving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
