import { FileText, X } from "lucide-react";

interface FilePreviewProps {
  path: string | null;
  content: string | null;
  mime: string;
  loading: boolean;
  onClose?: () => void;
}

export function FilePreview({ path, content, mime, loading, onClose }: FilePreviewProps) {
  if (!path) {
    return (
      <div className="file-preview empty">
        <FileText size={32} />
        <p>选择文件以预览</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="file-preview">
        <p className="muted">加载中...</p>
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="file-preview">
        <p className="error">无法加载文件内容</p>
      </div>
    );
  }

  const isMarkdown = mime === "text/markdown" || path.endsWith(".md");

  return (
    <div className="file-preview">
      <div className="file-preview-header">
        <div className="file-preview-header-left">
          <FileText size={15} />
          <span>{path}</span>
        </div>
        {onClose && (
          <button className="file-preview-close" aria-label="关闭预览" onClick={onClose}>
            <X size={15} />
          </button>
        )}
      </div>
      <div className="file-preview-body">
        {isMarkdown ? (
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: simpleMarkdown(content) }}
          />
        ) : (
          <pre className="code-block"><code>{content}</code></pre>
        )}
      </div>
    </div>
  );
}

function simpleMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");
  return `<p>${html}</p>`;
}
