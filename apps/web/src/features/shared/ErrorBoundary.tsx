import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * ErrorBoundary — catches render/lifecycle errors anywhere in the routed tree and
 * shows an honest, on-brand fallback ("Something went wrong" + Reload / Go Home)
 * instead of a blank white screen. Being a class component with
 * getDerivedStateFromError + componentDidCatch, it is the only React construct that
 * can trap descendant render errors.
 *
 * Navigation uses window.location rather than router hooks so it stays valid even
 * when the router context itself is the thing that failed.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the error for diagnostics; the UI stays graceful.
    console.error("Uncaught error in render tree:", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.assign("/");
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "26px",
          background:
            "radial-gradient(1200px 700px at 50% -8%,rgba(90,50,140,.6),#0c0618 60%),#0c0618",
          color: "var(--gold-lt)",
        }}
      >
        <div
          className="frame"
          style={{
            maxWidth: 520,
            width: "100%",
            padding: "48px 40px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              font: "900 64px Cinzel,serif",
              lineHeight: 1,
              background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            !
          </div>
          <div
            style={{
              font: "700 12px Inter",
              letterSpacing: 3,
              textTransform: "uppercase",
              color: "var(--gold)",
              marginTop: 8,
            }}
          >
            Unexpected error
          </div>
          <h1
            style={{
              margin: "14px 0 6px",
              font: "800 28px Cinzel,serif",
              color: "var(--gold-lt)",
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              margin: "0 auto",
              maxWidth: 380,
              font: "400 14px/1.6 Inter",
              color: "var(--ink)",
            }}
          >
            The app hit an unexpected error. You can reload the page to try again, or
            head back to the home screen.
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
              marginTop: 26,
            }}
          >
            <button
              className="btn btn-gold"
              style={{ padding: "14px 28px", fontSize: 14 }}
              onClick={this.handleReload}
            >
              Reload
            </button>
            <button
              className="btn btn-purple"
              style={{ padding: "14px 28px", fontSize: 14 }}
              onClick={this.handleGoHome}
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
