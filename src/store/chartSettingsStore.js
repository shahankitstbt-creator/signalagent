import { create } from 'zustand'

const KEY = 'protrader.chartSettings'
const DEFAULTS = {
  chartType: 'candles', // candles | hollow | heikin | bar | line | area | baseline

  // Symbol / candles
  upColor: '#089981', downColor: '#F23645',
  wickUpColor: '#089981', wickDownColor: '#F23645',
  borderUpColor: '#089981', borderDownColor: '#F23645',
  borderVisible: false,
  lineColor: '#2962FF', lineWidth: 2,
  precision: 'default', // 'default' | 0..8

  // Canvas
  background: '#0A0E17', gridColor: '#141d2e', gridVisible: true,
  crosshairMagnet: false, crosshairVisible: true,
  watermark: true, volumeVisible: true,

  // Scales
  scaleMode: 'normal', // normal | log | percent
  autoScale: true, invertScale: false, lastValueLabel: true,
}

const load = () => { try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) } } catch { return { ...DEFAULTS } } }

export const useChartSettings = create((set, get) => ({
  ...load(),
  set(patch) {
    set(patch)
    const { set: _s, reset: _r, ...state } = get()
    localStorage.setItem(KEY, JSON.stringify(state))
  },
  reset() { get().set({ ...DEFAULTS }) },
}))

export const SCALE_MODE = { normal: 0, log: 1, percent: 2 } // lightweight-charts PriceScaleMode
