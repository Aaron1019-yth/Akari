import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FileNode } from "../../../../../shared/exam-schema";

interface FileTreeProps {
  tree: FileNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onDelete?: (path: string) => void;
  onRename?: (path: string) => void;
}

export function FileTree({ tree, selectedPath, onSelect, onDelete, onRename }: FileTreeProps) {
  return (
    <div className="file-tree">
      {tree.length === 0 ? (
        <p className="workbench-empty">工作区为空，上传文件或让 Agent 创建</p>
      ) : (
        tree.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onDelete={onDelete}
            onRename={onRename}
          />
        ))
      )}
    </div>
  );
}

function FileTreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
  onDelete,
  onRename,
}: {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onDelete?: (path: string) => void;
  onRename?: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const isDir = node.type === "directory";
  const isSelected = selectedPath === node.path;

  return (
    <div className="filetree-node" style={{ paddingLeft: `${depth * 16}px` }}>
      <div
        className={`filetree-row ${isSelected ? "selected" : ""}`}
        onClick={() => {
          if (isDir) {
            setExpanded((prev) => !prev);
          } else {
            onSelect(node.path);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpen(true);
        }}
      >
        {isDir ? (
          expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
        ) : (
          <span style={{ width: 14 }} />
        )}
        {isDir ? (
          expanded ? <FolderOpen size={16} /> : <Folder size={16} />
        ) : (
          <FileText size={16} />
        )}
        <span className="filetree-name">{node.name}</span>
        {!isDir && (
          <span className="filetree-size">{formatSize(node.size)}</span>
        )}

        {menuOpen && (
          <div className="filetree-menu" ref={menuRef}>
            {onRename && (
              <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onRename(node.path); }}>
                <Pencil size={13} /> 重命名
              </button>
            )}
            {onDelete && (
              <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(node.path); }}>
                <Trash2 size={13} /> 删除
              </button>
            )}
          </div>
        )}
      </div>

      {isDir && expanded && node.children && (
        node.children.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onDelete={onDelete}
            onRename={onRename}
          />
        ))
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
