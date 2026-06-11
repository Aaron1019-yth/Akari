import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100vh", gap: 16,
          fontFamily: "system-ui, sans-serif", color: "#666",
        }}>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>出了点问题</h1>
          <p style={{ color: "#999" }}>{this.state.error?.message || "未知错误"}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{ padding: "8px 24px", borderRadius: 6, border: "1px solid #ccc", cursor: "pointer", background: "#fff" }}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
