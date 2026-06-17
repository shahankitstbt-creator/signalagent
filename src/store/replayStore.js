import { create } from 'zustand'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// Bar Replay: show only bars[0..index]; play/step to reveal history like TradingView.
export const useReplayStore = create((set) => ({
  active: false,
  index: 0,
  playing: false,
  speed: 1,
  start(len) { set({ active: true, index: Math.max(20, Math.floor(len * 0.6)), playing: false }) },
  stop() { set({ active: false, playing: false }) },
  setIndex(len, i) { set({ index: clamp(i, 10, len), playing: false }) },
  step(len, d) { set(s => ({ index: clamp(s.index + d, 10, len), playing: false })) },
  togglePlay() { set(s => ({ playing: !s.playing })) },
  setSpeed(sp) { set({ speed: sp }) },
  tick(len) { set(s => { const ni = s.index + 1; return ni >= len ? { index: len, playing: false } : { index: ni } }) },
}))
