import { useMemo } from "react";
import { FileText, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatFileSize, getPathName, isMarkdownFile, splitWorkspacePath } from "../../utils";

const markdownPlugins = [remarkGfm];

function countLines(content: string): number {
  let count = 1;
  for (let index = 0; index < content.length; index++) {
    if (content.charCodeAt(index) === 10) count++;
  }
  return count;
}

interface FilePreviewProps {
  path: string | null;
  content: string | null;
  mime: string;
  size: number;
  loading: boolean;
  onClose?: () => void;
}

export function FilePreview({ path, content, mime, size, loading, onClose }: FilePreviewProps) {
  const isImage = mime.startsWith("image/");
  const lineCount = useMemo(() => content && !isImage ? countLines(content) : 0, [content, isImage]);

  if (!path) {
    return (
      <div className="file-preview empty">
        <FileText size={32} />
        <p>选择文件以预览</p>
      </div>
    );
  }

  const isMarkdown = isMarkdownFile(path, mime);
  const fileName = getPathName(path);
  const breadcrumbs = splitWorkspacePath(path);

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
        ) : isImage ? (
          <div className="image-preview-frame">
            <img src={content} alt={fileName} />
          </div>
        ) : isMarkdown ? (
          <div className="markdown-body editor-markdown">
            <ReactMarkdown remarkPlugins={markdownPlugins}>{content}</ReactMarkdown>
          </div>
        ) : (
          <pre className="code-block editor-code"><code>{content}</code></pre>
        )}
      </div>

      <div className="file-statusbar">
        <span>{mime}</span>
        <span>{lineCount} 行</span>
        <span>{formatFileSize(size)}</span>
      </div>
    </div>
  );
}
