import { useEffect } from 'react'
import TopBar from './components/TopBar'
import ChartContainer from './components/Chart/ChartContainer'
import Toasts from './components/Alerts/Toasts'
import Watchlist from './components/Panels/Watchlist'
import BreadthPanel from './components/Panels/BreadthPanel'
import ObjectTree from './components/Panels/ObjectTree'
import ControlPanel from './components/Panels/ControlPanel'
import PicksPanel from './components/Panels/PicksPanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import AgentDashboard from './components/Agent/AgentDashboard'
import SignalsBoard from './components/Agent/SignalsBoard'
import TradingJournal from './components/Agent/TradingJournal'
import { useChartStore } from './store/chartStore'
import { useLayoutStore } from './store/layoutStore'
import { useViewStore } from './store/viewStore'

// NOTE: strategy signal generation is intentionally disabled for now (per request).
// The Indian-market screener (Picks) drives the workflow instead.
export default function App() {
  const load = useChartStore(s => s.load)
  const layout = useLayoutStore(s => s.layout)
  const view = useViewStore(s => s.view)
  useEffect(() => { load() }, [load])

  // Signal board is home; content agent + chart are switchable views.
  if (view === 'board') return <ErrorBoundary><SignalsBoard /></ErrorBoundary>
  if (view === 'journal') return <ErrorBoundary><TradingJournal /></ErrorBoundary>
  if (view === 'agent') return <ErrorBoundary><AgentDashboard /></ErrorBoundary>

  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <Toasts />
      <div className="flex-1 flex min-h-0">
        <aside className="w-52 shrink-0 bg-bg-panel border-r border-border p-2 hidden md:flex flex-col gap-3 overflow-y-auto">
          <Watchlist />
          <BreadthPanel />
          <ObjectTree />
          <ControlPanel />
        </aside>

        <main className="flex-1 min-w-0 flex">
          {layout === 1
            ? <ErrorBoundary><ChartContainer /></ErrorBoundary>
            : (
              <div className={`grid gap-px bg-border w-full h-full ${layout === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2'}`}>
                {Array.from({ length: layout }).map((_, i) => (
                  <div key={i} className="bg-bg-base min-h-0 min-w-0 flex">
                    <ErrorBoundary><ChartContainer paneIndex={i} /></ErrorBoundary>
                  </div>
                ))}
              </div>
            )}
        </main>

        <aside className="w-80 shrink-0 bg-bg-panel border-l border-border p-2 hidden lg:block">
          <ErrorBoundary><PicksPanel /></ErrorBoundary>
        </aside>
      </div>

      <footer className="h-7 shrink-0 flex items-center gap-3 px-3 bg-bg-panel border-t border-border text-txt-muted text-[11px] mono">
        ProTrader OS · Indian-market screener · signals paused
      </footer>
    </div>
  )
}
