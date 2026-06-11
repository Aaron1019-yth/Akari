import { X } from "lucide-react";
import type { UiTheme } from "../../../../../shared/exam-schema";
import { uiThemeOptions } from "../../utils";

interface SettingsModalProps {
  show: boolean;
  tab: "provider" | "appearance";
  onClose: () => void;
  onTabChange: (tab: "provider" | "appearance") => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
  saved: boolean;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  baseUrl: string;
  onBaseUrlChange: (value: string) => void;
  model: string;
  onModelChange: (value: string) => void;
  keyIsSet: boolean;
  keyMasked: string;
  tavilyKey: string;
  onTavilyKeyChange: (value: string) => void;
  serperKey: string;
  onSerperKeyChange: (value: string) => void;
  braveKey: string;
  onBraveKeyChange: (value: string) => void;
  tavilyKeyMeta: { isSet: boolean; masked: string };
  serperKeyMeta: { isSet: boolean; masked: string };
  braveKeyMeta: { isSet: boolean; masked: string };
  uiTheme: UiTheme;
  onUiThemeChange: (theme: UiTheme) => void;
}

export function SettingsModal({
  show,
  tab,
  onClose,
  onTabChange,
  onSave,
  saving,
  error,
  saved,
  apiKey,
  onApiKeyChange,
  baseUrl,
  onBaseUrlChange,
  model,
  onModelChange,
  keyIsSet,
  keyMasked,
  tavilyKey,
  onTavilyKeyChange,
  serperKey,
  onSerperKeyChange,
  braveKey,
  onBraveKeyChange,
  tavilyKeyMeta,
  serperKeyMeta,
  braveKeyMeta,
  uiTheme,
  onUiThemeChange,
}: SettingsModalProps) {
  if (!show) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="icon-muted" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="settings-tabs">
          <button className={tab === "provider" ? "active" : ""} onClick={() => onTabChange("provider")}>
            模型设置
          </button>
          <button className={tab === "appearance" ? "active" : ""} onClick={() => onTabChange("appearance")}>
            界面设置
          </button>
        </div>

        <div className="settings-body">
          {tab === "provider" ? (
            <>
              <label className="settings-field">
                <span>API Key</span>
                {keyIsSet && !apiKey && (
                  <p className="settings-hint">已设置 ({keyMasked})</p>
                )}
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => onApiKeyChange(e.target.value)}
                  placeholder={keyIsSet ? "留空则保持不变" : "输入 DeepSeek API Key"}
                />
              </label>

              <label className="settings-field">
                <span>Base URL</span>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => onBaseUrlChange(e.target.value)}
                  placeholder="https://api.deepseek.com"
                />
              </label>

              <label className="settings-field">
                <span>模型</span>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => onModelChange(e.target.value)}
                  placeholder="deepseek-v4-flash"
                />
              </label>

              <label className="settings-field">
                <span>Tavily Search Key</span>
                {tavilyKeyMeta.isSet && !tavilyKey && (
                  <p className="settings-hint">已设置 ({tavilyKeyMeta.masked})</p>
                )}
                <input
                  type="password"
                  value={tavilyKey}
                  onChange={(e) => onTavilyKeyChange(e.target.value)}
                  placeholder={tavilyKeyMeta.isSet ? "留空则保持不变" : "可选，用于 web_search"}
                />
              </label>

              <label className="settings-field">
                <span>Serper Search Key</span>
                {serperKeyMeta.isSet && !serperKey && (
                  <p className="settings-hint">已设置 ({serperKeyMeta.masked})</p>
                )}
                <input
                  type="password"
                  value={serperKey}
                  onChange={(e) => onSerperKeyChange(e.target.value)}
                  placeholder={serperKeyMeta.isSet ? "留空则保持不变" : "可选，用于 web_search"}
                />
              </label>

              <label className="settings-field">
                <span>Brave Search Key</span>
                {braveKeyMeta.isSet && !braveKey && (
                  <p className="settings-hint">已设置 ({braveKeyMeta.masked})</p>
                )}
                <input
                  type="password"
                  value={braveKey}
                  onChange={(e) => onBraveKeyChange(e.target.value)}
                  placeholder={braveKeyMeta.isSet ? "留空则保持不变" : "可选，用于 web_search"}
                />
              </label>
            </>
          ) : (
            <section className="appearance-settings">
              <div className="settings-field">
                <span>界面风格</span>
                <p className="settings-hint">字体使用 agent_demo-main 的 UI/衬线字体栈；主题会保存到本地配置。</p>
              </div>
              <div className="theme-options">
                {uiThemeOptions.map((option) => (
                  <button
                    className={uiTheme === option.value ? "theme-option active" : "theme-option"}
                    key={option.value}
                    onClick={() => onUiThemeChange(option.value)}
                  >
                    <span className={`theme-swatch ${option.value}`} />
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="settings-footer">
          {error && <p className="error">{error}</p>}
          {saved && <p className="settings-saved-msg">已保存</p>}
          <button className="primary" onClick={onSave} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
