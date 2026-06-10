import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class PageErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error(
      "[PageErrorBoundary] Render error caught:",
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-1 items-center justify-center p-10">
          <div className="max-w-sm w-full text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              Something went wrong
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              The backend may still be starting up. Please wait a moment and
              try again.
            </p>
            {this.state.message && (
              <p className="mt-2 text-xs font-mono text-muted-foreground/70 bg-muted rounded px-3 py-2 text-left break-all">
                {this.state.message}
              </p>
            )}
            <button
              onClick={() => this.setState({ hasError: false, message: "" })}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
