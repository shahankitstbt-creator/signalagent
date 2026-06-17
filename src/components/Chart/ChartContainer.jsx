import { useEffect, useRef, useMemo, useState } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'
import { useChartStore } from '../../store/chartStore'
import { useIndicatorStore } from '../../store/indicatorStore'
import { useSignalStore } from '../../store/signalStore'
import { useChartSettings, SCALE_MODE } from '../../store/chartSettingsStore'
import { INDICATORS } from '../Indicators/indicators'
import { createSyncGroup, baseOptions, addSeries, syncSeries } from './sync'
import { makePriceSeries, applyPriceStyle, priceData } from './series'
import { ZonePrimitive } from './ZonePrimitive'
import { DrawingPrimitive } from './DrawingPrimitive'
import { useDrawingStore } from '../../store/drawingStore'
import { useReplayStore } from '../../store/replayStore'
import { useAlertStore } from '../Alerts/AlertEngine'
import DrawToolbar from './DrawToolbar'
import ChartToolbar from './ChartToolbar'
import ReplayBar from './ReplayBar'
import PaneHeader from './PaneHeader'
import { useLayoutStore } from '../../store/layoutStore'
import { useChartData } from './useChartData'

const VOL_BULL = '#089a8155', VOL_BEAR = '#f2364555'

// paneIndex == null → single full chart (global store). paneIndex set → grid pane (local feed).
export default function ChartContainer({ paneIndex = null }) {
  const single = paneIndex == null
  // global store (single mode)
  const gAll = useChartStore(s => s.bars)
  const gLoading = useChartStore(s => s.loading)
  const gError = useChartStore(s => s.error)
  const gAsset = useChartStore(s => s.assetClass)
  const gSym = useChartStore(s => s.symbol)
  const gInt = useChartStore(s => s.interval)
  // pane store (grid mode)
  const gridCount = useLayoutStore(s => s.layout)
  const pane = useLayoutStore(s => single ? null : s.panes[paneIndex])
  const paneData = useChartData(pane?.assetClass, pane?.symbol, pane?.interval, !single)
  const showPanes = single || gridCount <= 2 // indicator sub-panes fit when ≤2 charts

  const assetClass = single ? gAsset : pane.assetClass
  const symbol = single ? gSym : pane.symbol
  const interval = single ? gInt : pane.interval
  const replayActiveRaw = useReplayStore(s => s.active)
  const replayIndex = useReplayStore(s => s.index)
  const replayActive = replayActiveRaw && single
  const allBars = single ? gAll : paneData.bars
  const bars = useMemo(() => replayActive ? allBars.slice(0, replayIndex) : allBars, [allBars, replayActive, replayIndex])
  const loading = single ? gLoading : paneData.loading
  const error = single ? gError : paneData.error
  const active = useIndicatorStore(s => s.active)
  const signals = useSignalStore(s => s.signals)
  const selected = useSignalStore(s => s.selected)
  const settings = useChartSettings()
  const drawKey = `${assetClass}:${symbol}`
  const shapes = useDrawingStore(s => s.byKey[drawKey])
  const tool = useDrawingStore(s => s.tool)
  const [hover, setHover] = useState(null)
  const [menu, setMenu] = useState(null) // right-click context menu {x,y,price}
  const [plus, setPlus] = useState(null) // price-scale + button {y, price}
  const [plusOpen, setPlusOpen] = useState(false)

  const wrap = useRef(null)
  const mainDiv = useRef(null)
  const chart = useRef(null)
  const candle = useRef(null)   // active price series (type-dependent)
  const vol = useRef(null)
  const ovMap = useRef(new Map())
  const zonePrim = useRef(null)
  const sigZone = useRef(null)
  const sigLines = useRef([])
  const drawPrim = useRef(null)
  const keyRef = useRef(drawKey)
  keyRef.current = drawKey
  const dataKey = useRef('')
  const sync = useRef(null)
  if (!sync.current) sync.current = createSyncGroup()

  const overlays = useMemo(() => active.filter(a => INDICATORS[a.id].type === 'overlay'), [active])
  const panes = useMemo(() => active.filter(a => INDICATORS[a.id].type === 'pane'), [active])

  // chart instance + volume + primitives (once)
  useEffect(() => {
    const c = createChart(mainDiv.current, baseOptions({
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#1E2D42', scaleMargins: { top: 0.08, bottom: 0.26 } },
    }))
    vol.current = c.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false })
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    zonePrim.current = new ZonePrimitive()
    sigZone.current = new ZonePrimitive()
    drawPrim.current = new DrawingPrimitive()
    chart.current = c

    const onClick = (param) => {
      const ds = useDrawingStore.getState()
      if (ds.tool === 'cursor' || !param.point || !candle.current) return
      const price = candle.current.coordinateToPrice(param.point.y)
      const time = param.time ?? c.timeScale().coordinateToTime(param.point.x)
      if (price == null || time == null) return
      const key = keyRef.current
      if (ds.tool === 'hline') return ds.add(key, { type: 'hline', price, color: '#FFD600' })
      if (ds.tool === 'vline') return ds.add(key, { type: 'vline', t: time, color: '#FFD600' })
      if (ds.tool === 'text') { const t = window.prompt('Text label:'); if (t) ds.add(key, { type: 'text', t: time, p: price, text: t, color: '#E0E8F0' }); return }
      if (!ds.pending) return ds.setPending({ t: time, p: price })
      const col = ds.tool === 'fib' ? '#AA00FF' : ds.tool === 'rect' ? '#00E5FF' : ds.tool === 'measure' ? '#00C853' : '#2962FF'
      ds.add(key, { type: ds.tool, t1: ds.pending.t, p1: ds.pending.p, t2: time, p2: price, color: col })
    }
    const onMove = (param) => {
      // OHLC legend
      const b = param.time != null ? useChartStore.getState().bars.find(x => x.time === param.time) : null
      setHover(b || null)
      // price-scale + button follows the crosshair
      if (param.point && candle.current) setPlus({ y: param.point.y, price: candle.current.coordinateToPrice(param.point.y) })
      else { setPlus(null); setPlusOpen(false) }
      // drawing preview
      const ds = useDrawingStore.getState()
      if (!ds.pending || !param.point || !candle.current) { drawPrim.current?.setPreview(null); return }
      const price = candle.current.coordinateToPrice(param.point.y)
      const time = param.time ?? c.timeScale().coordinateToTime(param.point.x)
      if (price == null || time == null) return
      const col = ds.tool === 'fib' ? '#AA00FF' : ds.tool === 'rect' ? '#00E5FF' : '#2962FF'
      drawPrim.current.setPreview({ type: ds.tool, t1: ds.pending.t, p1: ds.pending.p, t2: time, p2: price, color: col })
    }
    c.subscribeClick(onClick)
    c.subscribeCrosshairMove(onMove)
    sync.current.add(c)
    return () => { sync.current.remove(c); c.remove() }
  }, [])

  // (re)create the price series when chart type changes; re-attach primitives
  useEffect(() => {
    const c = chart.current
    if (!c) return
    if (candle.current) { try { c.removeSeries(candle.current) } catch {} }
    candle.current = makePriceSeries(c, useChartSettings.getState())
    candle.current.attachPrimitive(zonePrim.current)
    candle.current.attachPrimitive(sigZone.current)
    candle.current.attachPrimitive(drawPrim.current)
    dataKey.current = '' // force data effect to setData onto the new series
  }, [settings.chartType])

  // apply appearance settings live (background, grid, crosshair, watermark, scale, series style)
  useEffect(() => {
    const c = chart.current
    if (!c) return
    c.applyOptions({
      layout: { background: { color: settings.background } },
      grid: {
        vertLines: { visible: settings.gridVisible, color: settings.gridColor },
        horzLines: { visible: settings.gridVisible, color: settings.gridColor },
      },
      crosshair: { mode: settings.crosshairMagnet ? CrosshairMode.Magnet : (settings.crosshairVisible ? CrosshairMode.Normal : CrosshairMode.Hidden) },
      watermark: { visible: settings.watermark, text: symbol, color: 'rgba(107,127,153,0.10)', fontSize: 46, fontFamily: 'JetBrains Mono' },
      rightPriceScale: { mode: SCALE_MODE[settings.scaleMode] ?? 0, autoScale: settings.autoScale, invertScale: settings.invertScale },
    })
    if (candle.current) applyPriceStyle(candle.current, settings)
    vol.current?.applyOptions({ visible: settings.volumeVisible })
  }, [settings, symbol])

  // price + volume data — incremental on live ticks (keeps zoom/timeframe)
  useEffect(() => {
    if (!candle.current || !bars.length) return
    // dataset identity includes bars[0].time so the incremental update() path only
    // runs for genuine same-dataset live appends — never when symbol/interval/data changed.
    const key = `${assetClass}:${symbol}:${interval}:${settings.chartType}:${bars[0].time}`
    const pd = priceData(bars, settings.chartType)
    const volData = bars.map(b => ({ time: b.time, value: b.volume, color: b.close >= b.open ? VOL_BULL : VOL_BEAR }))
    try {
      if (dataKey.current === key && settings.chartType !== 'heikin') {
        candle.current.update(pd[pd.length - 1]); vol.current.update(volData[volData.length - 1])
      } else {
        candle.current.setData(pd); vol.current.setData(volData); dataKey.current = key
      }
    } catch { candle.current.setData(pd); vol.current.setData(volData); dataKey.current = key }
  }, [bars, assetClass, symbol, interval, settings.chartType])

  // overlay indicators — reconciled (reuse series; update on opts/data change)
  useEffect(() => {
    const c = chart.current, cs = candle.current
    if (!c || !cs || !bars.length) return
    const map = ovMap.current
    const dKey = `${assetClass}:${symbol}:${interval}:${settings.chartType}:${bars[0].time}`
    const activeUids = new Set(overlays.map(o => o.uid))
    const drop = (uid, e) => {
      e.series.forEach(s => { try { c.removeSeries(s.obj) } catch {} })
      e.lines.forEach(pl => { try { cs.removePriceLine(pl) } catch {} })
      map.delete(uid)
    }
    for (const [uid, e] of [...map]) if (!activeUids.has(uid)) drop(uid, e)

    let markers = [], zones = []
    for (const o of overlays) {
      const tfs = o.opts._tf
      if (Array.isArray(tfs) && tfs.length && !tfs.includes(interval)) { const e = map.get(o.uid); if (e) drop(o.uid, e); continue }
      let res
      try { res = INDICATORS[o.id].compute(bars, o.opts) } catch (err) { console.error('indicator', o.id, err); continue }
      res.series = (res.series || []).filter(s => !o.opts['hide_' + s.key]) // per-plot show/hide
      const optsKey = JSON.stringify(o.opts)
      const e = map.get(o.uid)
      const full = !e || e.dataKey !== dKey || e.optsKey !== optsKey
      const series = syncSeries(c, e?.series || [], res.series, full)
      const oldLines = e?.lines || []
      oldLines.forEach(pl => { try { cs.removePriceLine(pl) } catch {} })
      const lines = (res.levels || []).map(l => cs.createPriceLine({ price: l.price, color: l.color, title: l.title, lineWidth: l.width || 1, lineStyle: l.style || 0 }))
      map.set(o.uid, { series, lines, optsKey, dataKey: dKey })
      if (res.markers) markers = markers.concat(res.markers)
      if (res.zones) zones = zones.concat(res.zones)
    }
    markers.sort((x, y) => x.time - y.time)
    try { cs.setMarkers(markers) } catch {}
    try { zonePrim.current.setZones(zones) } catch {}
  }, [overlays, bars, assetClass, symbol, interval, settings.chartType])

  // selected signal lines/zones (signals currently paused → usually empty)
  useEffect(() => {
    const cs = candle.current
    if (!cs) return
    sigLines.current.forEach(pl => { try { cs.removePriceLine(pl) } catch {} })
    sigLines.current = []
    const sig = signals.find(s => s.id === selected)
    if (!sig) { try { sigZone.current.setZones([]) } catch {}; return }
    const mk = (price, color, title, w = 1) => { try { sigLines.current.push(cs.createPriceLine({ price, color, title, lineWidth: w, lineStyle: 0 })) } catch {} }
    mk(sig.entry, '#E0E8F0', `ENTRY ${sig.grade}`, 2); mk(sig.stop, '#FF1744', 'SL', 2)
    sig.tps.forEach((tp, k) => mk(tp, ['#FFD600', '#00C853', '#00E5FF'][k], `TP${k + 1}`))
    sigZone.current.setZones([
      { time1: sig.time, time2: bars.at(-1)?.time ?? sig.time, price1: sig.entry, price2: sig.stop, fill: 'rgba(255,23,68,0.10)', border: 'rgba(255,23,68,0.4)' },
      { time1: sig.time, time2: bars.at(-1)?.time ?? sig.time, price1: sig.entry, price2: sig.tps[2], fill: 'rgba(0,200,83,0.08)', border: 'rgba(0,200,83,0.4)' },
    ])
  }, [signals, selected, bars, settings.chartType])

  useEffect(() => { drawPrim.current?.setShapes(shapes || []) }, [shapes])

  const onReset = () => { try { chart.current.timeScale().fitContent(); chart.current.priceScale('right').applyOptions({ autoScale: true }) } catch {} }
  const onScreenshot = () => { try { const cv = chart.current.takeScreenshot(); const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = `${symbol}.png`; a.click() } catch {} }
  const onFullscreen = () => { const el = wrap.current; if (!document.fullscreenElement) el?.requestFullscreen?.(); else document.exitFullscreen?.() }

  const D = 86400
  const setRange = (key) => {
    const c = chart.current; if (!c || !bars.length) return
    if (key === 'All') { try { c.timeScale().fitContent() } catch {}; return }
    const last = bars.at(-1).time, first = bars[0].time
    const durs = { '1D': D, '5D': 5 * D, '1M': 30 * D, '3M': 91 * D, '6M': 182 * D, '1Y': 365 * D, '5Y': 1826 * D }
    let from
    if (key === 'YTD') { const d = new Date(last * 1000); from = Math.floor(Date.UTC(d.getUTCFullYear(), 0, 1) / 1000) }
    else from = last - durs[key]
    from = Math.max(from, first)
    try { c.timeScale().setVisibleRange({ from, to: last }); c.priceScale('right').applyOptions({ autoScale: true }) }
    catch { try { c.timeScale().fitContent() } catch {} }
  }
  const gotoDate = (str) => {
    const c = chart.current; if (!c || !str || !bars.length) return
    const t = Math.floor(new Date(str + 'T00:00:00Z').getTime() / 1000)
    const from = Math.max(bars[0].time, t - 30 * D), to = Math.min(bars.at(-1).time, t + 10 * D)
    try { c.timeScale().setVisibleRange({ from, to }); c.priceScale('right').applyOptions({ autoScale: true }) } catch {}
  }

  const lb = hover || bars.at(-1)
  const prev = bars.length > 1 ? bars[bars.length - 2] : null
  const dp = lb && lb.close < 10 ? 4 : 2

  return (
    <div ref={wrap} className="flex-1 flex flex-col min-h-0 bg-bg-base">
      {single
        ? <ChartToolbar onReset={onReset} onScreenshot={onScreenshot} onFullscreen={onFullscreen} />
        : <PaneHeader paneIndex={paneIndex} />}
      <div className="relative flex-1 min-h-0"
        onDoubleClick={onReset}
        onContextMenuCapture={(e) => {
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          const oy = e.clientY - r.top, ox = e.clientX - r.left
          let region = 'chart'
          try { const psw = chart.current.priceScale('right').width(); if (ox > r.width - psw) region = 'price' } catch {}
          const price = candle.current?.coordinateToPrice(oy)
          setMenu({ x: ox, y: oy, price, region })
        }}>
        <div ref={mainDiv} className={`absolute inset-0 ${tool !== 'cursor' ? 'cursor-crosshair' : ''}`} />
        {menu && <ContextMenu menu={menu} close={() => setMenu(null)} symbol={symbol} assetClass={assetClass}
          onReset={onReset} onScreenshot={onScreenshot} />}
        {single && <DrawToolbar />}
        {single && <ReplayBar />}
        {lb && <OHLCLegend symbol={symbol} bar={lb} prev={prev} dp={dp} />}
        {active.length > 0 && (
          <div className="absolute top-7 left-2 z-10 flex flex-col gap-0 pointer-events-none">
            {active.map(a => <span key={a.uid} className="mono text-[10px] text-txt-sec">{INDICATORS[a.id].name}{a.opts.len ? ` ${a.opts.len}` : ''}</span>)}
          </div>
        )}
        {plus && tool === 'cursor' && plus.price != null && (
          <div className="absolute z-20" style={{ top: Math.max(2, plus.y - 11), right: 56 }}>
            <button onMouseDown={(e) => { e.stopPropagation(); setPlusOpen(o => !o) }}
              title="Add alert / line here"
              className="w-5 h-5 rounded-full bg-accent text-white text-xs flex items-center justify-center shadow hover:scale-110 transition">＋</button>
            {plusOpen && (
              <div className="absolute right-6 top-0 bg-bg-card border border-border rounded shadow-xl py-1 w-40 mono text-xs">
                <button onMouseDown={() => { useAlertStore.getState().addPriceAlert(symbol, +plus.price.toFixed(plus.price < 10 ? 4 : 2)); setPlusOpen(false) }}
                  className="w-full text-left px-3 py-1.5 hover:bg-bg-panel text-txt">🔔 Alert at {plus.price.toFixed(plus.price < 10 ? 4 : 2)}</button>
                <button onMouseDown={() => { useDrawingStore.getState().add(`${assetClass}:${symbol}`, { type: 'hline', price: +plus.price, color: '#FFD600' }); setPlusOpen(false) }}
                  className="w-full text-left px-3 py-1.5 hover:bg-bg-panel text-txt">─ Line at {plus.price.toFixed(plus.price < 10 ? 4 : 2)}</button>
              </div>
            )}
          </div>
        )}
        {loading && <div className="absolute top-9 right-3 text-txt-sec text-xs mono">loading…</div>}
        {error && <div className="absolute top-9 right-3 text-red text-xs mono">⚠ {error}</div>}
      </div>
      {showPanes && panes.map(p => <PaneChart key={p.uid} inst={p} bars={bars} sync={sync} dataKey={`${assetClass}:${symbol}:${interval}:${bars[0]?.time}`} />)}
      <TimeRangeBar onRange={setRange} onGoto={gotoDate} onReset={onReset} compact={!single} />
    </div>
  )
}

function TimeRangeBar({ onRange, onGoto, onReset, compact }) {
  const [goto, setGoto] = useState('')
  const RANGES = compact ? ['1M', '3M', '1Y', 'All'] : ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'All']
  return (
    <div className="h-7 shrink-0 flex items-center gap-1 px-2 bg-bg-panel border-t border-border overflow-hidden">
      {RANGES.map(r => (
        <button key={r} onClick={() => onRange(r)} className="mono text-[11px] px-1.5 py-0.5 rounded text-txt-sec hover:bg-bg-card hover:text-txt">{r}</button>
      ))}
      {!compact && <>
        <div className="w-px h-4 bg-border mx-1" />
        <span className="mono text-[10px] text-txt-muted">Go to</span>
        <input type="date" value={goto} onChange={e => { setGoto(e.target.value); onGoto(e.target.value) }}
          className="bg-bg-base border border-border rounded mono text-[10px] px-1 py-0.5 text-txt-sec" />
      </>}
      <button onClick={onReset} title="Reset view (fit all)" className="ml-auto mono text-[11px] px-2 py-0.5 rounded text-txt-sec hover:bg-bg-card hover:text-txt">⟲</button>
    </div>
  )
}

function OHLCLegend({ symbol, bar, prev, dp }) {
  const up = prev ? bar.close >= prev.close : bar.close >= bar.open
  const chg = prev ? bar.close - prev.close : bar.close - bar.open
  const chgPct = prev && prev.close ? (chg / prev.close) * 100 : 0
  const col = up ? 'text-bull' : 'text-bear'
  const V = ({ l, v }) => <span className="text-txt-muted">{l}<span className={`ml-0.5 ${col}`}>{v}</span></span>
  const f = n => n?.toFixed(dp)
  return (
    <div className="absolute top-1.5 left-2 z-10 flex flex-wrap items-center gap-x-2.5 gap-y-0 mono text-[11px] pointer-events-none">
      <span className="text-txt font-bold">{symbol}</span>
      <V l="O" v={f(bar.open)} /><V l="H" v={f(bar.high)} /><V l="L" v={f(bar.low)} /><V l="C" v={f(bar.close)} />
      <span className={col}>{chg >= 0 ? '+' : ''}{f(chg)} ({chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}%)</span>
      {bar.volume ? <span className="text-txt-muted">Vol <span className="text-txt-sec">{abbr(bar.volume)}</span></span> : null}
    </div>
  )
}
const abbr = (n) => n >= 1e7 ? (n / 1e7).toFixed(2) + 'Cr' : n >= 1e5 ? (n / 1e5).toFixed(2) + 'L' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n)

function ContextMenu({ menu, close, symbol, assetClass, onReset, onScreenshot }) {
  const s = useChartSettings()
  const setSettings = s.set
  const addDraw = useDrawingStore(s => s.add)
  const Item = ({ label, hint, check, fn }) => (
    <button onClick={() => { fn(); close() }} className="w-full flex items-center justify-between gap-4 px-3 py-1.5 hover:bg-bg-panel mono text-xs text-txt">
      <span className="flex items-center gap-2"><span className="w-3 text-accent">{check ? '✓' : ''}</span>{label}</span>
      {hint && <span className="text-txt-muted">{hint}</span>}
    </button>
  )
  const Sep = () => <div className="h-px bg-border my-1" />
  const priceMenu = menu.region === 'price'
  return (
    <>
      <div className="fixed inset-0 z-[90]" onClick={close} onContextMenu={(e) => { e.preventDefault(); close() }} />
      <div className="absolute z-[91] bg-bg-card border border-border rounded shadow-xl py-1 w-60" style={{ left: Math.max(0, menu.x - (priceMenu ? 230 : 0)), top: menu.y }}>
        {priceMenu ? (<>
          <Item label="Auto (fit data)" check={s.autoScale} fn={() => setSettings({ autoScale: !s.autoScale })} />
          <Item label="Invert scale" hint="Alt+I" check={s.invertScale} fn={() => setSettings({ invertScale: !s.invertScale })} />
          <Sep />
          <Item label="Regular" check={s.scaleMode === 'normal'} fn={() => setSettings({ scaleMode: 'normal' })} />
          <Item label="Percent" hint="Alt+P" check={s.scaleMode === 'percent'} fn={() => setSettings({ scaleMode: 'percent' })} />
          <Item label="Logarithmic" hint="Alt+L" check={s.scaleMode === 'log'} fn={() => setSettings({ scaleMode: 'log' })} />
          <Sep />
          <Item label="Reset price scale" fn={onReset} />
        </>) : (<>
          {menu.price != null && <Item label={`＋ Horizontal line @ ${menu.price.toFixed(menu.price < 10 ? 4 : 2)}`} fn={() => addDraw(`${assetClass}:${symbol}`, { type: 'hline', price: menu.price, color: '#FFD600' })} />}
          <Item label="Reset view" fn={onReset} />
          <Sep />
          <Item label="Regular scale" check={s.scaleMode === 'normal'} fn={() => setSettings({ scaleMode: 'normal' })} />
          <Item label="Logarithmic" check={s.scaleMode === 'log'} fn={() => setSettings({ scaleMode: 'log' })} />
          <Item label="Percent" check={s.scaleMode === 'percent'} fn={() => setSettings({ scaleMode: 'percent' })} />
          <Sep />
          <Item label="Take screenshot" fn={onScreenshot} />
        </>)}
      </div>
    </>
  )
}

function PaneChart({ inst, bars, sync, dataKey }) {
  const div = useRef(null)
  const chart = useRef(null)
  const series = useRef([])
  const pls = useRef([])
  const meta = useRef({ optsKey: '', dataKey: '' })

  useEffect(() => {
    const c = createChart(div.current, baseOptions())
    chart.current = c
    sync.current.add(c)
    return () => { sync.current.remove(c); c.remove() }
  }, [])

  useEffect(() => {
    const c = chart.current
    if (!c || !bars.length) return
    let res
    try { res = INDICATORS[inst.id].compute(bars, inst.opts) } catch (e) { console.error('pane', inst.id, e); return }
    const visible = (res.series || []).filter(s => !inst.opts['hide_' + s.key])
    const optsKey = JSON.stringify(inst.opts)
    const full = meta.current.dataKey !== dataKey || meta.current.optsKey !== optsKey || series.current.length === 0
    series.current = syncSeries(c, series.current, visible, full)
    const first = series.current[0]?.obj
    pls.current.forEach(pl => { try { first?.removePriceLine(pl) } catch {} })
    pls.current = first ? (res.priceLines || []).map(p => first.createPriceLine({ ...p, lineStyle: 2, lineWidth: 1 })) : []
    meta.current = { optsKey, dataKey }
  }, [bars, inst.opts, dataKey])

  return (
    <div className="relative h-36 shrink-0 border-t border-border">
      <div className="absolute top-1 left-2 z-10 text-xs mono text-txt-sec pointer-events-none">{INDICATORS[inst.id].name}</div>
      <div ref={div} className="absolute inset-0" />
    </div>
  )
}
