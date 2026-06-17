import { create } from 'zustand'

// Top-level view: the Agent dashboard is home; the trading chart is a tool.
export const useViewStore = create((set) => ({
  view: 'board', // 'board' (signals) | 'agent' (content) | 'chart'
  setView(view) { set({ view }) },
}))
