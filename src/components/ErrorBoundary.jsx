import React from 'react'

// Confines any render/effect crash to a recoverable panel instead of a blank page.
export class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err, info) { console.error('[ErrorBoundary]', err, info?.componentStack) }
  reset = () => this.setState({ err: null })
  render() {
    if (this.state.err) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-bg-base p-6">
          <div className="max-w-md text-center">
            <div className="text-yellow mono text-sm mb-2">⚠ A panel hit an error and was contained.</div>
            <div className="text-txt-muted mono text-[11px] mb-4 break-words">{String(this.state.err?.message || this.state.err)}</div>
            <div className="flex gap-2 justify-center">
              <button onClick={this.reset} className="mono text-xs px-3 py-1.5 rounded bg-accent text-white">Retry</button>
              <button onClick={() => location.reload()} className="mono text-xs px-3 py-1.5 rounded bg-bg-card border border-border">Reload app</button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
