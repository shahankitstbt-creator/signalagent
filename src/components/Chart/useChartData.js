import { useEffect, useRef, useState } from 'react'
import { getHistory, subscribe } from '../../data/DataManager'

// Independent OHLCV feed for a grid pane (mirrors chartStore.load, but local).
export function useChartData(assetClass, symbol, interval, enabled) {
  const [state, setState] = useState({ bars: [], loading: false, error: null, lastPrice: null })
  const subRef = useRef(null)
  const tokenRef = useRef(0)

  useEffect(() => {
    if (!enabled || !symbol) return
    const token = ++tokenRef.current
    let alive = true
    setState(s => ({ ...s, loading: true, error: null }))
    if (subRef.current) { subRef.current.close(); subRef.current = null }
    getHistory(assetClass, symbol, interval, 3000).then(bars => {
      if (token !== tokenRef.current || !alive) return
      if (!bars.length) throw new Error('No data')
      setState({ bars, loading: false, error: null, lastPrice: bars.at(-1).close })
      subRef.current = subscribe(assetClass, symbol, interval, (bar) => {
        if (token !== tokenRef.current) return
        setState(s => {
          const cur = s.bars, last = cur.at(-1)
          let next
          if (last && last.time === bar.time) next = [...cur.slice(0, -1), bar]
          else if (!last || bar.time > last.time) next = [...cur, bar]
          else return s
          return { ...s, bars: next, lastPrice: bar.close }
        })
      })
    }).catch(e => { if (token === tokenRef.current && alive) setState({ bars: [], loading: false, error: e.message, lastPrice: null }) })
    return () => { alive = false; if (subRef.current) { subRef.current.close(); subRef.current = null } }
  }, [assetClass, symbol, interval, enabled])

  return state
}
