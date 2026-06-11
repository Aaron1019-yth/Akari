import { FileText, X } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface FilePreviewProps {
  path: string | null;
  content: string | null;
  mime: string;
  size: number;
  loading: boolean;
  onClose?: () => void;
}

export function FilePreview({ path, content, mime, size, loading, onClose }: FilePreviewProps) {
  if (!path) {
    return (
      <div className="file-preview empty">
        <FileText size={32} />
        <p>选择文件以预览</p>
      </div>
    );
  }

  const isMarkdown = mime === "text/markdown" || path.endsWith(".md");
  const fileName = path.split(/[\\/]/).pop() || path;
  const breadcrumbs = path.split(/[\\/]/).filter(Boolean);
  const lineCount = content ? content.split("\n").length : 0;

  return (
    <div className="file-preview vscode-preview">
      <div className="file-tabbar">
        <div className="file-tab active" title={path}>
          <FileText size={14} />
          <span>{fileName}</span>
          {onClose && (
            <button aria-label="关闭预览" onClick={onClose}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="file-breadcrumbs" title={path}>
        <span>workspace</span>
        <span className="file-breadcrumb-current">{breadcrumbs.join(" / ")}</span>
      </div>

      <div className="file-preview-body editor-surface">
        {loading ? (
          <p className="muted">加载中...</p>
        ) : content === null ? (
          <p className="error">无法加载文件内容</p>
        ) : isMarkdown ? (
          <div className="markdown-body editor-markdown">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        ) : (
          <pre className="code-block editor-code"><code>{content}</code></pre>
        )}
      </div>

      <div className="file-statusbar">
        <span>{mime}</span>
        <span>{lineCount} 行</span>
        <span>{formatSize(size)}</span>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
