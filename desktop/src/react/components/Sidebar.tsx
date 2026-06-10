import { Link2, MessageSquareText, Plus, Search, Settings } from "lucide-react";

interface SidebarProps {
  sessions: Array<{ session_id: string; message_count: number; last_message_at: string; preview: string }>;
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
}

export function Sidebar({ sessions, activeSessionId, onSelectSession, onNewSession, onOpenSettings }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <strong>对话</strong>
        <div>
          <button aria-label="新建对话" onClick={onNewSession}>
            <Plus size={17} />
          </button>
          <button aria-label="设置" onClick={onOpenSettings}>
            <Settings size={17} />
          </button>
        </div>
      </div>

      <button className="social-entry">
        <Link2 size={17} />
        <span>接入社交平台</span>
        <i />
      </button>

      {sessions.length === 0 ? (
        <div className="sidebar-empty">还没有对话哦</div>
      ) : (
        sessions.map((s) => (
          <button
            className={`session ${s.session_id === activeSessionId ? "is-active" : ""}`}
            key={s.session_id}
            onClick={() => onSelectSession(s.session_id)}
          >
            <MessageSquareText size={17} />
            <span>
              {s.preview || s.session_id}
              <small>{s.message_count} 条消息</small>
            </span>
          </button>
        ))
      )}

      <div className="sidebar-divider" />

      <label className="sidebar-search">
        <Search size={17} />
        <input placeholder="搜索聊天记录" />
      </label>

      <button className="session settings-button" onClick={onOpenSettings}>
        <Settings size={18} />
        设置
      </button>
    </aside>
  );
}
