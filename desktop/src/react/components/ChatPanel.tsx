import { Loader2, Plus, Sparkles } from "lucide-react";
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
      <header className="chat-statusbar">
        <div>
          <strong>对话式规划教练</strong>
          <span>{sendingChat ? (currentToolLabel ? `正在${currentToolLabel}` : "正在回复") : "就绪"}</span>
        </div>
        <div className="status-pills">
          <span>{messages.length} 条消息</span>
          <span>{filesCount} 个文件</span>
        </div>
      </header>

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
            if (file) void onUploadFile(file);
          }}
        />
        <textarea
          aria-label="输入对话消息"
          placeholder="选中页面任意文字，会浮出一个临时输入框"
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
          <button>自动审核</button>
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
