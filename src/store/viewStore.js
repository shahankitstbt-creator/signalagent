import { create } from 'zustand'

// Top-level view: the Agent dashboard is home; the trading chart is a tool.
// A ?view=chart URL param opens the app straight into the chart (used by the "Chart" button that opens
// a new window), so the standalone chart window lands on the chart, not the board.
function initialView() {
  try { const v = new URLSearchParams(location.search).get('view'); if (['board', 'agent', 'chart', 'journal'].includes(v)) return v } catch { }
  return 'board'
}
export const useViewStore = create((set) => ({
  view: initialView(),
  setView(view) { set({ view }) },
}))
