"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort catch-all. OpenUI's own Renderer wraps every generated
 * component in its own per-node boundary (falls back to the last valid
 * render on error) and catches DSL parse failures internally — but that
 * protection only covers the generated-dashboard subtree. A throw anywhere
 * in this app's OWN plain React code (GenerativeChat, DashboardShell, a
 * hook) had nothing catching it at all: React unmounts the whole tree up to
 * the nearest boundary, and with none present that meant the entire page —
 * sidebar, composer, everything — went blank with no way back except a full
 * reload, which also drops the in-memory conversation. This does not fix
 * whatever throws; it stops one bad render from taking the whole app down
 * with it, and gives a way back to the current page without losing state
 * in sibling trees.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("[ErrorBoundary] caught a render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-crash-fallback">
          <strong>Something broke in the UI.</strong>
          <p>{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
