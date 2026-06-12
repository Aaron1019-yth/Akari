import type { TaskDifficulty, TaskFocus, TaskStatus, TaskType, TimeSlot, UiTheme } from "../../../shared/exam-schema";

export const statusLabel: Record<TaskStatus, string> = {
  pending: "待开始",
  in_progress: "进行中",
  completed: "已完成",
  skipped: "已跳过"
};

export const slotLabel: Record<TimeSlot, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上"
};

export const timeSlots: TimeSlot[] = ["morning", "afternoon", "evening"];

export const taskTypeOptions: Array<{ label: string; value: TaskType }> = [
  { label: "综合", value: "study" },
  { label: "练题", value: "practice" },
  { label: "复习", value: "review" },
  { label: "模考", value: "mock_exam" },
  { label: "申论", value: "essay" }
];

export const taskDifficultyOptions: Array<{ label: string; value: TaskDifficulty }> = [
  { label: "轻松", value: "easy" },
  { label: "适中", value: "ok" },
  { label: "吃力", value: "hard" },
];

export const taskFocusOptions: Array<{ label: string; value: TaskFocus }> = [
  { label: "专注", value: "focused" },
  { label: "正常", value: "normal" },
  { label: "分心", value: "distracted" },
];

export const supportedUploadExtensions = [
  ".pdf",
  ".docx",
  ".jpg",
  ".jpeg",
  ".md",
  ".markdown",
  ".txt",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".yaml",
  ".yml",
  ".rtf",
  ".html",
  ".htm",
  ".xml",
  ".tex",
  ".log",
  ".ini",
  ".conf",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".css",
];

export const weekDayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export const uiThemeOptions: Array<{ label: string; value: UiTheme; description: string }> = [
  { label: "新暖纸", value: "agent_warm_paper", description: "agent_demo-main 的纸本配色与字体气质" },
  { label: "Akari 冷灰蓝", value: "akari_cool", description: "当前更偏工作台的浅灰蓝风格" },
  { label: "经典米色", value: "classic_beige", description: "上一版柔和米色界面" },
];

export function formatFileSize(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

export function getPathName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function splitWorkspacePath(path: string): string[] {
  return path.split(/[\\/]/).filter(Boolean);
}

export function isMarkdownFile(path: string, mime: string): boolean {
  return mime === "text/markdown" || [".md", ".markdown"].includes(getFileExtension(path));
}

export function nextExamDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 150);
  return formatAppDate(date);
}

export function formatAppDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00+08:00`);
  date.setDate(date.getDate() + days);
  return formatAppDate(date);
}

export function shortDate(dateString: string): string {
  return dateString.slice(5);
}

export function toolLabel(name: string): string {
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
