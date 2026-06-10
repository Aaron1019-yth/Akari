import { PanelLeft, PanelRight } from "lucide-react";

export function Titlebar() {
  return (
    <header className="app-titlebar">
      <div className="window-controls" aria-hidden="true">
        <span className="traffic red" />
        <span className="traffic yellow" />
        <span className="traffic green" />
        <button aria-label="切换左侧栏">
          <PanelLeft size={17} />
        </button>
      </div>
      <div className="titlebar-tabs" role="tablist" aria-label="主视图">
        <button className="active">聊天</button>
        <button>频道</button>
      </div>
      <button className="titlebar-right" aria-label="切换右侧栏">
        <PanelRight size={17} />
      </button>
    </header>
  );
}
