import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Top-level crash guard (user-reported, 2026-08: "touch the sound slider and
 * the whole thing goes blank"). The app had NO error boundary anywhere —
 * any uncaught exception during render, in ANY component, unmounts the
 * entire React tree to a blank `<div id="root">` with nothing on screen and
 * nothing in view for a player with no console access (mobile). This
 * doesn't fix whatever specific error was being thrown near the slider
 * (that needs an actual repro/stack trace) — it fixes the BLANK-SCREEN
 * symptom generally: any future crash now shows a visible message and a
 * reload button instead of silently nuking the whole app, and the message
 * itself becomes the next debugging clue.
 */
interface ErrorBoundaryState {
  error: Error | null
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('Uncaught render error:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="app-frame error-boundary">
        <h1>Something went wrong</h1>
        <p className="muted">
          The game hit an unexpected error and had to stop. Your progress is safe — it auto-saves after every
          action.
        </p>
        <pre className="error-boundary-detail">{error.message}</pre>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    )
  }
}
