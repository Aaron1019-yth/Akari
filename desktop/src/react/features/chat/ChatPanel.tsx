import { ExternalLink, FileText, Loader2, Plus, X } from "lucide-react";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, GoalTree } from "../../../../../shared/exam-schema";

const CHOICE_LINE_RE = /^\s*\[选项:\s*(.+?)\s*\]\s*$/;
const markdownPlugins = [remarkGfm];

function parseAssistantContent(content: string): { markdown: string; choices: string[] } {
  const choices: string[] = [];
  const lines = content.split("\n");
  const markdownLines = lines.filter((line) => {
    const match = line.match(CHOICE_LINE_RE);
    if (!match) return true;
    choices.push(...match[1].split("|").map((choice) => choice.trim()).filter(Boolean));
    return false;
  });
  return { markdown: markdownLines.join("\n").trim(), choices };
}

interface ChatPanelProps {
  loading: boolean;
  error: string | null;
  messages: ChatMessage[];
  sendingChat: boolean;
  currentToolLabel: string | null;
  chatInput: string;
  onChatInputChange: (value: string) => void;
  pendingAttachment: File | null;
  attachmentForReview: boolean;
  uploadingFile: string | null;
  uploadError: string | null;
  conversationRef: React.RefObject<HTMLElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onSend: () => void;
  onSelectChoice: (choice: string) => void;
  onAbort: () => void;
  onAttachFile: (file: File) => void;
  onAttachmentForReviewChange: (value: boolean) => void;
  onRemoveAttachment: () => void;
  onCancelUpload: () => void;
}

export function ChatPanel({
  loading,
  error,
  messages,
  sendingChat,
  currentToolLabel,
  chatInput,
  onChatInputChange,
  pendingAttachment,
  attachmentForReview,
  uploadingFile,
  uploadError,
  conversationRef,
  fileInputRef,
  onSend,
  onSelectChoice,
  onAbort,
  onAttachFile,
  onAttachmentForReviewChange,
  onRemoveAttachment,
  onCancelUpload,
}: ChatPanelProps) {
  const parsedMessages = useMemo(() => messages.map((message) => ({
    message,
    parsed: message.role === "assistant" ? parseAssistantContent(message.content) : null,
  })), [messages]);

  return (
    <main
      className="chat-panel"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) onAttachFile(file);
      }}
      onPaste={(event) => {
        const file = event.clipboardData.files[0];
        if (file) onAttachFile(file);
      }}
    >
      <section className="conversation" ref={conversationRef}>
        {loading && <p className="muted">正在连接 Akari 后端...</p>}
        {error && <p className="error">{error}</p>}
        {!loading && messages.length === 0 && (
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
            <p className="agent-empty-tagline">
              我不替代粉笔错题本。把粉笔导出的错题资料拖进来，我帮你提炼跨题诊断、记忆清单和下一步训练建议。
            </p>
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
        {parsedMessages.length > 0 && (
          <div className="message-list">
            {parsedMessages.map(({ message, parsed }, index) => (
              <article className={`chat-message ${message.role}`} key={`${message.created_at}-${index}`}>
                <span>{message.role === "user" ? "你" : "Akari"}</span>
                {message.role === "assistant" ? (
                  <>
                    <div className="markdown-body"><ReactMarkdown remarkPlugins={markdownPlugins}>{parsed?.markdown ?? ""}</ReactMarkdown></div>
                    {parsed?.choices.length ? (
                      <div className="chat-choice-list" aria-label="可选回答">
                        {parsed.choices.map((choice) => (
                          <button key={choice} className="chat-choice-button" disabled={sendingChat} onClick={() => onSelectChoice(choice)}>
                            {choice}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p>{message.content}</p>
                )}
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
          accept=".pdf,.docx,.jpg,.jpeg,.md,.markdown,.txt,.csv,.tsv,.json,.jsonl,.yaml,.yml,.rtf,.html,.htm,.xml,.tex,.log"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            if (file) onAttachFile(file);
          }}
        />
        <textarea
          aria-label="输入对话消息"
          placeholder="告诉我你的考试目标..."
          value={chatInput}
          onChange={(event) => onChatInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void onSend();
            }
          }}
        />
        {pendingAttachment && (
          <div className="composer-attachment-row">
            <div className="composer-attachment-chip">
              <FileText size={16} />
              <span>{pendingAttachment.name}</span>
              <button aria-label="移除附件" disabled={sendingChat || Boolean(uploadingFile)} onClick={onRemoveAttachment}>
                <X size={14} />
              </button>
            </div>
            <label className="composer-review-toggle" title="勾选后文件归档到 review/ 文件夹，并纳入今日复盘">
              <input
                type="checkbox"
                checked={attachmentForReview}
                disabled={sendingChat || Boolean(uploadingFile)}
                onChange={(event) => onAttachmentForReviewChange(event.target.checked)}
              />
              入复盘
            </label>
            {/\.(jpg|jpeg)$/i.test(pendingAttachment.name) && (
              <span className="composer-attachment-hint">图片仅归档与预览；复盘建议附一段文字说明。</span>
            )}
          </div>
        )}
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
          {sendingChat && (
            <>
              <button className="abort-button" onClick={onAbort}>中断</button>
              {currentToolLabel && <span className="tool-status">正在{currentToolLabel}...</span>}
            </>
          )}
          <button className="send-button" disabled={(!chatInput.trim() && !pendingAttachment) || sendingChat || Boolean(uploadingFile)} onClick={() => void onSend()}>
            {sendingChat ? "发送中" : "发送"}
          </button>
        </div>
      </section>
    </main>
  );
}
