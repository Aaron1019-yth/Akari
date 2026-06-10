import { ExternalLink, Loader2, Plus, Sparkles } from "lucide-react";
import type { ChatMessage, GoalTree } from "../../../../shared/exam-schema";

interface ChatPanelProps {
  loading: boolean;
  error: string | null;
  goal: GoalTree | null;
  messages: ChatMessage[];
  sendingChat: boolean;
  currentToolLabel: string | null;
  filesCount: number;
  chatInput: string;
  onChatInputChange: (value: string) => void;
  uploadingFile: string | null;
  uploadError: string | null;
  conversationRef: React.RefObject<HTMLElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onSend: () => void;
  onAbort: () => void;
  onCreatePlan: () => void;
  onUploadFile: (file: File) => void;
  onCancelUpload: () => void;
}

export function ChatPanel({
  loading,
  error,
  goal,
  messages,
  sendingChat,
  currentToolLabel,
  filesCount,
  chatInput,
  onChatInputChange,
  uploadingFile,
  uploadError,
  conversationRef,
  fileInputRef,
  onSend,
  onAbort,
  onCreatePlan,
  onUploadFile,
  onCancelUpload,
}: ChatPanelProps) {
  return (
    <main
      className="chat-panel"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) void onUploadFile(file);
      }}
      onPaste={(event) => {
        const file = event.clipboardData.files[0];
        if (file) void onUploadFile(file);
      }}
    >
      <section className="conversation" ref={conversationRef}>
        {loading && <p className="muted">正在连接 Akari 后端...</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !goal && (
          <div className="onboarding">
            <h2>还没有 active Goal</h2>
            <p>先生成一份规则版计划，后续再接入规划师 Agent 和诊断对话。</p>
            <button className="primary" onClick={onCreatePlan}>
              生成第一周计划
            </button>
          </div>
        )}
        {goal && messages.length === 0 && (
          <div className="agent-empty">
            <div className="agent-avatar-new">
              <svg viewBox="0 0 100 100" width="72" height="72">
                <circle cx="50" cy="50" r="48" fill="#f5f0e8" stroke="#c8b8a0" strokeWidth="1" />
                <path d="M35 35 C35 25, 45 20, 55 22 C60 23, 65 28, 65 35 C65 38, 64 40, 62 42 C68 45, 72 52, 72 60 C72 75, 60 85, 45 85 C35 85, 28 78, 28 68 C28 62, 30 58, 33 55 C30 52, 28 48, 28 44 C28 38, 31 35, 35 35Z" fill="#5a7a8a" />
                <circle cx="42" cy="38" r="3" fill="#f5f0e8" />
                <path d="M55 18 C58 15, 62 16, 64 20 C66 18, 68 19, 68 22 C65 22, 62 20, 60 22" fill="none" stroke="#8ab4c4" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M62 16 C65 14, 68 15, 68 18" fill="none" stroke="#8ab4c4" strokeWidth="1" strokeLinecap="round" />
              </svg>
            </div>
            <h1>Akari 随时都在</h1>
            <div className="agent-links">
              <span className="agent-link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                工作台：OH-WorkSpace
                <ExternalLink size={13} />
              </span>
              <span className="agent-link">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                记忆
              </span>
            </div>
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
            if (file) void onUploadFile(file);
          }}
        />
        <p className="composer-hint">选中页面任意文字，会浮出一个临时输入框</p>
        <textarea
          aria-label="输入对话消息"
          placeholder=""
          value={chatInput}
          onChange={(event) => onChatInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void onSend();
            }
          }}
        />
        {(uploadingFile || uploadError) && (
          <div className="composer-upload-row">
            {uploadingFile ? (
              <>
                <Loader2 size={15} className="spin" />
                <span>{uploadingFile}</span>
                <button onClick={onCancelUpload}>取消</button>
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
          <button>操作前询问</button>
          <span />
          <button>请选择模型</button>
          {sendingChat && (
            <>
              <button className="abort-button" onClick={onAbort}>中断</button>
              {currentToolLabel && <span className="tool-status">正在{currentToolLabel}...</span>}
            </>
          )}
          <button className="send-button" disabled={!chatInput.trim() || sendingChat} onClick={() => void onSend()}>
            {sendingChat ? "发送中" : "发送"}
          </button>
        </div>
      </section>
    </main>
  );
}
