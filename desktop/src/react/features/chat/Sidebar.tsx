import { MessageSquareText, Plus, Settings, Trash2 } from "lucide-react";

interface SidebarProps {
  sessions: Array<{ session_id: string; message_count: number; last_message_at: string; preview: string }>;
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
  onDeleteSession?: (sessionId: string) => void;
}

export function Sidebar({ sessions, activeSessionId, onSelectSession, onNewSession, onOpenSettings, onDeleteSession }: SidebarProps) {
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

      {sessions.length === 0 ? (
        <div className="sidebar-empty">还没有对话</div>
      ) : (
        sessions.map((s) => (
          <div
            className={`session ${s.session_id === activeSessionId ? "is-active" : ""}`}
            key={s.session_id}
          >
            <button className="session-content" onClick={() => onSelectSession(s.session_id)}>
              <MessageSquareText size={17} />
              <span>
                {s.preview || s.session_id}
                <small>{s.message_count} 条消息</small>
              </span>
            </button>
            {onDeleteSession && (
              <button
                className="session-delete"
                aria-label="删除会话"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(s.session_id);
                }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))
      )}
    </aside>
  );
}
