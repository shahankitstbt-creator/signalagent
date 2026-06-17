import { useChartStore } from './chartStore'
import { useIndicatorStore } from './indicatorStore'
import { useDrawingStore } from './drawingStore'
import { useAlertStore } from '../components/Alerts/AlertEngine'
import { ASSET_CLASSES } from '../data/DataManager'

const LAST = 'protrader.last'
const NAMED = 'protrader.layouts'

function snapshot() {
  const c = useChartStore.getState(), i = useIndicatorStore.getState()
  const d = useDrawingStore.getState(), a = useAlertStore.getState()
  return { assetClass: c.assetClass, symbol: c.symbol, interval: c.interval, indicators: i.active, drawings: d.byKey, alerts: a.config }
}
function apply(s) {
  if (!s) return
  const cs = {}
  // ignore saved symbol/class if the class is no longer supported (e.g. old crypto)
  if (s.assetClass && ASSET_CLASSES.includes(s.assetClass)) { cs.assetClass = s.assetClass; if (s.symbol) cs.symbol = s.symbol }
  if (s.interval) cs.interval = s.interval
  if (Object.keys(cs).length) useChartStore.setState(cs)
  if (s.indicators) useIndicatorStore.setState({ active: s.indicators })
  if (s.drawings) useDrawingStore.setState({ byKey: s.drawings })
  if (s.alerts) useAlertStore.setState({ config: s.alerts })
}

export function restore() {
  try { apply(JSON.parse(localStorage.getItem(LAST))) } catch { /* ignore */ }
}

export function initPersistence() {
  let t
  const save = () => { clearTimeout(t); t = setTimeout(() => localStorage.setItem(LAST, JSON.stringify(snapshot())), 800) }
  useChartStore.subscribe(save)
  useIndicatorStore.subscribe(save)
  useDrawingStore.subscribe(save)
  useAlertStore.subscribe(save)
}

// Named layouts
export const listLayouts = () => { try { return JSON.parse(localStorage.getItem(NAMED)) || {} } catch { return {} } }
export function saveLayout(name) { const all = listLayouts(); all[name] = snapshot(); localStorage.setItem(NAMED, JSON.stringify(all)); useChartStore.getState().load() }
export function loadLayout(name) { const all = listLayouts(); if (all[name]) { apply(all[name]); useChartStore.getState().load() } }
export function deleteLayout(name) { const all = listLayouts(); delete all[name]; localStorage.setItem(NAMED, JSON.stringify(all)) }
