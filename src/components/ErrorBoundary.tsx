import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  onReset: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Shows the error instead of a blank window if a screen crashes. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("A screen crashed:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="config">
          <h1>Something went wrong</h1>
          <p className="note">
            Copy the text below and send it over so it can be fixed. The rest of the app is fine.
          </p>
          <pre className="crash">
            {this.state.error.stack ?? this.state.error.message}
          </pre>
          <div className="config-buttons">
            <button
              className="primary"
              onClick={() => {
                this.setState({ error: null });
                this.props.onReset();
              }}
            >
              Back to main menu
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}