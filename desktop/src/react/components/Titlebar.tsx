import { PanelLeft, PanelRight } from "lucide-react";

interface TitlebarProps {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
}

export function Titlebar({ leftCollapsed, rightCollapsed, onToggleLeft, onToggleRight }: TitlebarProps) {
  return (
    <header className="app-titlebar">
      <button
        className={`titlebar-toggle ${leftCollapsed ? "collapsed" : ""}`}
        aria-label={leftCollapsed ? "展开左侧栏" : "收起左侧栏"}
        onClick={onToggleLeft}
      >
        <PanelLeft size={15} />
      </button>
      <div className="titlebar-center">Akari</div>
      <button
        className={`titlebar-toggle ${rightCollapsed ? "collapsed" : ""}`}
        aria-label={rightCollapsed ? "展开右侧栏" : "收起右侧栏"}
        onClick={onToggleRight}
      >
        <PanelRight size={15} />
      </button>
    </header>
  );
}
