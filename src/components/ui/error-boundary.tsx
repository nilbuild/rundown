import { Component, type ErrorInfo, type ReactNode } from "react";
import { PrimaryButton } from "~/components/ui/button";

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
    console.error("rundown crashed", error, info.componentStack);
  }

  render() {
    if (!this.state.message) {
      return this.props.children;
    }

    return (
      <div className="mx-auto max-w-[440px] px-8 py-[90px] text-center [&_h2]:mb-2 [&_h2]:font-serif [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:tracking-[-0.015em] [&_p]:mb-5 [&_p]:text-[13.5px] [&_p]:leading-[1.6] [&_p]:text-muted pt-[140px]">
        <h2>Something broke</h2>
        <p>{this.state.message}</p>
        <PrimaryButton onClick={() => window.location.reload()}>
          Reload
        </PrimaryButton>
      </div>
    );
  }
}
