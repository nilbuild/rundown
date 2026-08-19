import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  message: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: Error): State {
    return { message: error.message || String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("sift crashed", error, info.componentStack);
  }

  render() {
    if (!this.state.message) {
      return this.props.children;
    }

    return (
      <div className="empty-state welcome">
        <h2>Something broke</h2>
        <p>{this.state.message}</p>
        <button type="button" className="primary-button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
