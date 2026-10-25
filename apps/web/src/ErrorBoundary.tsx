import { Component, type ErrorInfo, type ReactNode } from "react";

interface State { error: Error | null }

/** Last-resort crash screen — a visible message beats a white page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ maxWidth: 640, margin: "5rem auto", padding: "0 1.5rem" }}>
          <h1 style={{ fontSize: "1.6rem" }}>Something broke</h1>
          <pre style={{ background: "#f6f1e9", padding: "1rem", borderRadius: 8, overflowX: "auto", fontSize: "0.85rem" }}>
            {this.state.error.message}
          </pre>
          <button onClick={() => { this.setState({ error: null }); location.href = "/"; }}>
            Back to start
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
